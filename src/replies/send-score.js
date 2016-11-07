'use strict';

import Response from './response';

export default class SendScore extends Response {
	constructor(params) {
		super('setGameScore', params);
	}

	resolveParams({payload}) {
		return Object.assign({}, payload, this.params);
	}
}
