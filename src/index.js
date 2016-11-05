'use strict';

import stream from 'stream';

import Bacon from 'baconjs';
import request from 'request';
import Promise from 'bluebird';

const defaults = {
	baseUrl: 'https://api.telegram.org/bot',
	timeout: 60 * 1000,
	// interval: 10 * 1000,
	interval: 10 * 100,
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
		return () => ({text});
	},

	game(url) {
		return () => ({url});
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
		const polling = stream.plug(this.initPolling());
		const filtered = stream.filter(({update_id}) => !(update_id in ids));

		filtered.onValue(update => {
			const {update_id} = update;
			const cacheIndex = cache.push(update) - 1;
			ids[update_id] = cacheIndex;
		});

		return filtered;
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
				.get({url, qs: params, timeout: this.options.timeout})
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
					if ('message' in payload) {
						return this.invokeMethod('sendMessage', Object.assign({
							chat_id: payload.message.chat.id,
						}, response));
					}

					if ('callback_query' in payload) {
						return this.invokeMethod('answerCallbackQuery', Object.assign({
							callback_query_id: payload.callback_query.id,
						}, response));
					}

					if ('inline_query' in payload) {
						return this.invokeMethod('answerInlineQuery', Object.assign({
							inline_query_id: payload.inline_query.id,
						}, response, {
							results: JSON.stringify(response.results),
						}));
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
