'use strict';

import Text from './text';

export default class HTML extends Text {
	resolveParams(payload) {
		return {
			chat_id: payload.message.chat.id,
			parse_mode: 'HTML',
			text: this.text,
		};
	}
}
