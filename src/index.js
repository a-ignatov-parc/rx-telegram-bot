'use strict';

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

const defaults = {
	baseUrl: 'https://api.telegram.org/bot',
	timeout: 60 * 1000,
	interval: 100,
	useWebhook: true,
	host: 'localhost',
	port: 3000,
};

export const filters = {
	text(string) {
		return ({message = {}}) => {
			const {text = ''} = message;
			return ~text.indexOf(string);
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
		return () => new Callback({url});
	},

	sendGame(shortName) {
		return () => new SendGame(shortName);
	},

	results(results) {
		return () => new Inline({results});
	},
};

export default class Bot {
	constructor(token, options = {}) {
		this.options = Object.assign({}, defaults, options);
		this.token = token;
		this.cache = [];
		this.stream = this.initStream(this.cache);
	}

	initStream(cache) {
		const ids = {};
		const stream = new Bacon.Bus();
		const updates = stream.plug(this.initRealtimeUpdates());
		const filtered = stream.filter(({update_id}) => !(update_id in ids));

		filtered.onValue(update => {
			const {update_id} = update;
			const cacheIndex = cache.push(update) - 1;
			ids[update_id] = cacheIndex;
		});

		return filtered;
	}

	initRealtimeUpdates() {
		if (this.options.useWebhook) {
			return this.initWebhook();
		} else {
			return this.initPolling();
		}
	}

	initWebhook() {
		return Bacon.fromBinder(sink => {
			const {host, port} = this.options;

			const server = http.createServer((request, response) => {
				if (request.method === 'POST') {
					request.pipe(consumeBuffer(buffer => {
						const string = buffer.toString();
						const json = JSON.parse(string);
						response.end();
						sink(json);
					}));
				}
			});

			const stop = () => {
				server.close(() => {
					console.log(`Webhook server is stopped`);
					ngrok.disconnect();
				});
			};

			process.on('exit', stop);
			process.on('SIGINT', stop);
			process.on('uncaughtException', stop);

			this.initNgrokProxy(port)
				.then(url => this.invokeMethod('setWebhook', {url}))
				.then(() => new Promise(resolve => server.listen(port, host, resolve)))
				.then(() => console.log(`Webhook server started at ${host}:${port}`));

			return stop;
		});
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

			poller();

			return stop;
		});
	}

	initNgrokProxy(port = 3000) {
		return new Promise((resolve, reject) => {
			ngrok.connect(port, (error, url) => {
				if (error) return reject(error);
				resolve(url);
			});
		});
	}

	getUpdatesStream() {
		return this.stream;
	}

	getAllUpdatesStream() {
		return Bacon
			.fromArray(this.cache)
			.merge(this.stream);
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
