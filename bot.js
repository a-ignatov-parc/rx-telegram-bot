'use strict';

import fs from 'fs';

import Bot, {filters, replies} from './src/index';

import tokens from './tokens.json';

const CACHE = './cache.json';

const {command} = filters;
const {text} = replies;

const bot = new Bot(tokens.botazavr);

let cache;

try {
	cache = JSON.parse(fs.readFileSync(CACHE));
} catch(error) {
	cache = {};
}

if (!cache.botazavr) cache.botazavr = {};

const updates = bot
	.getUpdatesStream()
	.filter(({update_id}) => update_id > (cache.botazavr.lastUpdateId || 0));

updates.onValue(({update_id}) => {
	if ((cache.botazavr.lastUpdateId || 0) < update_id) {
		cache.botazavr.lastUpdateId = update_id;
	}
});

// updates.log(111);

updates
	.filter(command('ping'))
	.onValue(bot.reply(text('pong')));

process.on('exit', exitHandler);
process.on('SIGINT', exitHandler);
process.on('uncaughtException', exitHandler);

function exitHandler() {
	fs.writeFileSync(CACHE, JSON.stringify(cache));
}
