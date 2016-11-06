'use strict';

import Response from './response';

export default class Text extends Response {
	constructor(text) {
		super('sendMessage');
		this.text = text;
	}

	resolveParams(payload) {
		return {
			chat_id: payload.message.chat.id,
			text: this.text,
		};
	}
}
