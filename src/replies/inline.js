'use strict';

import Response from './response';

export default class Inline extends Response {
	constructor(params) {
		super('answerInlineQuery', params);
	}

	resolveParams(payload) {
		const inline_query_id = payload.inline_query.id;
		const results = JSON.stringify(this.params.results || {});
		return Object.assign({inline_query_id}, this.params, {results});
	}
}
