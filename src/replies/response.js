'use strict';

export default class Response {
	constructor(method, params) {
		this.method = method;
		this.params = params;
	}

	resolveMethodName(payload) {
		return this.method;
	}

	resolveParams(payload) {
		return this.params;
	}

	resolve(payload, ...params) {
		return [
			this.resolveMethodName(payload, ...params),
			this.resolveParams(payload, ...params),
		];
	}
}
