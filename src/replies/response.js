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

	resolve(payload) {
		return [
			this.resolveMethodName(payload),
			this.resolveParams(payload),
		];
	}
}
