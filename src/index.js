'use strict';

import url from 'url';
import http from 'http';
import stream from 'stream';

import ngrok from 'ngrok';
import Bacon from 'baconjs';
import request from 'request';
import Promise from 'bluebird';

import Response from './replies/response';

import Inline from './replies/inline';
import Callback from './replies/callback';

import Text from './replies/text';
import HTML from './replies/html';
import Markdown from './replies/markdown';
import SendGame from './replies/send-game';
import SendScore from './replies/send-score';
import StartGame from './replies/start-game';

const defaults = {
	baseUrl: 'https://api.telegram.org/bot',
	timeout: 60 * 1000,
	interval: 100,
	webhook: true,
	host: 'localhost',
	port: 3000,
	url: null,
};

const GAME_SCORE = 'game_score';

export const notifications = {
	GAME_SCORE,
};

export const filters = {
	text(input) {
		return ({message = {}}) => {
			const {text = ''} = message;
			if (input instanceof RegExp) return input.test(text);
			return ~text.indexOf(input);
		};
	},

	command(name) {
		return ({message = {}}) => {
			const {text = '', entities = []} = message;
			const [entity] = entities.filter(({type, offset}) => type === 'bot_command' && !offset);
			return entity && text.substr(entity.offset, entity.length) === `/${name}`;
		};
	},

	callbacks() {
		return ({callback_query}) => callback_query;
	},

	inlineQueries() {
		return ({inline_query}) => inline_query;
	},

	game(shortName) {
		return ({callback_query = {}}) => callback_query.game_short_name === shortName;
	},
};

export const replies = {
	text(text) {
		return () => new Text(text);
	},

	markdown(text) {
		return () => new Markdown(text);
	},

	html(text) {
		return () => new HTML(text);
	},

	startGame(url) {
		return () => new StartGame({url});
	},

	sendGame(shortName) {
		return () => new SendGame(shortName);
	},

	results(results) {
		return () => new Inline({results});
	},

	sendScore(params) {
		return () => new SendScore(params);
	},
};

export default class Bot {
	constructor(token, options = {}) {
		this.options = Object.assign({}, defaults, options);

		const {
			url,
			host,
			port,
			webhook,
		} = this.options;

		this.token = token;
		this.server = this.initServer(url, host, port);
		this.notifications = this.initNotifications(this.server);
		this.messages = this.initMessages();
		this.messages.plug(webhook ? this.initWebhook(this.server) : this.initPolling());
	}

	initMessages() {
		const ids = {};
		const history = [];
		const stream = new Bacon.Bus();
		const filtered = stream.filter(({update_id}) => !(update_id in ids));

		filtered.onValue(update => {
			const {update_id} = update;
			const historyIndex = history.push(update) - 1;
			ids[update_id] = historyIndex;
		});

		return {
			history,
			stream: filtered,
			plug(substream) {
				return stream.plug(substream);
			},
		};
	}

	initServer(url, host, port) {
		const urlResolver = Promise.resolve(url || this.initNgrokProxy(port));

		const stream = Bacon.fromBinder(sink => {
			const server = http.createServer((request, response) => {
				const {method, url} = request;

				if (method === 'GET' || method === 'HEAD') {
					response.end();
					return sink({url, method});
				}

				request.pipe(consumeBuffer(buffer => {
					const string = buffer.toString();
					const body = JSON.parse(string);
					response.end();
					sink({url, method, body});
				}));
			});

			const serverInit = urlResolver.then(url => {
				return new Promise(resolve => {
					server.listen(port, host, () => resolve({url, host, port}));
				});
			});

			serverInit.then(({host, port}) => console.log(`Server started at ${host}:${port}`));

			const stop = () => {
				serverInit.then(({url}) => {
					ngrok.disconnect(url);
					server.close(() => console.log(`Server is stopped`));
				});
			};

			process.on('exit', stop);
			process.on('SIGINT', stop);
			process.on('uncaughtException', stop);

			return stop;
		});

		Object.assign(stream, {
			resolveUrl() {
				return urlResolver;
			}
		});

		return stream;
	}

	initNgrokProxy(port) {
		return new Promise((resolve, reject) => {
			ngrok.connect(port, (error, url) => {
				if (error) return reject(error);
				resolve(url);
			});
		});
	}

	initNotifications(server) {
		return server
			.map(payload => {
				const {query} = url.parse(payload.url, true);
				return {query, payload};
			})
			.filter(({query}) => 'score_id' in query)
			.map(({query: {score_id, score}}) => {
				const [user_id, message_id, chat_id] = new Buffer(score_id, 'hex').toString().split('-');
				return {
					type: GAME_SCORE,
					payload: {user_id, message_id, chat_id, score},
				};
			});
	}

	initWebhook(server) {
		const suffix = '/hook';

		server
			.resolveUrl()
			.then(url => this.invokeMethod('setWebhook', {url: url + suffix}));

		return server
			.filter(({url, method}) => url === suffix && method === 'POST')
			.map('.body');
	}

	initPolling() {
		return Bacon.fromBinder(sink => {
			let isActive = true;
			let timeout;

			const poller = () => {
				return this
					.invokeMethod('getUpdates', {timeout: this.options.timeout / 1000})
					.catch(error => [])
					.then(updates => updates.forEach(sink))
					.then(() => new Promise((resolve, reject) => {
						if (!isActive) return reject();
						timeout = setTimeout(resolve, this.options.interval);
					}))
					.then(poller);
			};

			const stop = () => {
				isActive = false;
				timeout && clearTimeout(timeout);
			};

			process.on('exit', stop);
			process.on('SIGINT', stop);
			process.on('uncaughtException', stop);

			this.invokeMethod('setWebhook', {url: ''}).then(poller);

			return stop;
		});
	}

	getNotificationsStream() {
		return this.notifications;
	}

	getUpdatesStream() {
		return this.messages.stream;
	}

	getAllUpdatesStream() {
		return Bacon
			.fromArray(this.messages.history)
			.merge(this.messages.stream);
	}

	invokeMethod(name, params = {}) {
		const requestPromise = new Promise((resolve, reject) => {
			const url = `${this.options.baseUrl + this.token}/${name}`;

			request
				.get({url, qs: params})
				.on('response', ({request: {uri, method}, statusCode}) => console.log(`${method}: ${uri.href} -> ${statusCode}`))
				.on('error', reject)
				.pipe(consumeBuffer(buffer => resolve(buffer)));
		});

		return requestPromise
			.then(buffer => buffer.toString())
			.then(string => JSON.parse(string))
			.then(json => json.result);
	}

	reply(handler) {
		return payload => {
			return Promise
				.resolve(handler(payload))
				.then(response => {
					if (response instanceof StartGame) {
						return this.server
							.resolveUrl()
							.then(url => this.invokeMethod(...response.resolve(payload, url)))
					}

					if (response instanceof Response) {
						return this.invokeMethod(...response.resolve(payload));
					}

					let commonResponse;

					if ('message' in payload) {
						commonResponse = new Text(response);
					}

					if ('callback_query' in payload) {
						commonResponse = new Callback(response);
					}

					if ('inline_query' in payload) {
						commonResponse = new Inline(response);
					}

					if (commonResponse) {
						return this.invokeMethod(...commonResponse.resolve(payload));
					}

					console.log(`I don't know how to reply to message with update_id = ${payload.update_id} =(`);
				});
		}
	}
};

function consumeBuffer(done) {
	return new stream.Writable({
		objectMode: true,

		write(buffer, enc, next) {
			done(buffer);
			next();
		},
	});
}
