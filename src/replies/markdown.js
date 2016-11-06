'use strict';

import Text from './text';

export default class Markdown extends Text {
	resolveParams(payload) {
		return {
			chat_id: payload.message.chat.id,
			parse_mode: 'Markdown',
			text: this.text,
		};
	}
}
