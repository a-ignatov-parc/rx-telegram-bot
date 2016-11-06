'use strict';

import Response from './response';

export default class SendGame extends Response {
	constructor(shortName) {
		super('sendGame');
		this.shortName = shortName;
	}

	resolveParams(payload) {
		return {
			chat_id: payload.message.chat.id,
			game_short_name: this.shortName,
		};
	}
}
