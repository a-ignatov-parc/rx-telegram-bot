'use strict';

import Response from './response';

export default class Callback extends Response {
	constructor(params) {
		super('answerCallbackQuery', params);
	}

	resolveParams(payload) {
		const callback_query_id = payload.callback_query.id;
		return Object.assign({callback_query_id}, this.params);
	}
}
