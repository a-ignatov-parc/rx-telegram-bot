'use strict';

import url from 'url';

import Callback from './callback';

export default class StartGame extends Callback {
	resolveParams(payload, baseUrl) {
		const params = super.resolveParams(payload);

		const {id: userId, username} = payload.callback_query.from;
		const messageId = payload.callback_query.message.message_id;
		const chatId = payload.callback_query.message.chat.id;

		const buffer = new Buffer([userId, messageId, chatId].join('-'));
		const id = buffer.toString('hex');

		const redirectUrl = `${baseUrl}?score_id=${id}`;
		const gameUrlObj = url.parse(params.url, true);

		Object.assign(gameUrlObj.query, {
			username,
			user_id: userId,
			score_url: redirectUrl,
		});

		const gameUrl = url.format(gameUrlObj);

		console.log('score_url ->', redirectUrl);

		return Object.assign({}, params, {url: gameUrl});
	}
}
