'use strict';

import fs from 'fs';

import Bot, {filters, replies, notifications} from './src/index';

import tokens from './tokens.json';

const CACHE = './cache.json';

const {
	game,
	text,
	command,
	callbacks,
	inlineQueries,
} = filters;

const {
	sendGame,
	sendScore,
	startGame,
	text: textReply,
	results: resultsReply,
	markdown: markdownReply,
} = replies;

const {GAME_SCORE} = notifications;

let cache;

try {
	cache = JSON.parse(fs.readFileSync(CACHE));
} catch(error) {
	cache = {};
}

if (!cache.botazavr) cache.botazavr = {};

const bot = new Bot(tokens.botazavr, {
	port: 9001,
});

bot
	.getNotificationsStream()
	.filter(({type}) => type === GAME_SCORE)
	.onValue(bot.reply(sendScore({edit_message: true})));

const updates = bot
	.getUpdatesStream()
	.filter(({update_id}) => update_id > (cache.botazavr.lastUpdateId || 0));

updates.onValue(({update_id}) => {
	if ((cache.botazavr.lastUpdateId || 0) < update_id) {
		cache.botazavr.lastUpdateId = update_id;
	}
});

updates
	.filter(command('start'))
	.merge(updates.filter(command('help')))
	.onValue(bot.reply(textReply('Welcome human! How are you doing?')));

updates
	.filter(text(/ping/i))
	.onValue(bot.reply(textReply('pong')));

updates
	.filter(command('game'))
	.onValue(bot.reply(sendGame('runner_4game')));

updates
	.filter(game('runner_4game'))
	.onValue(bot.reply(startGame('https://a-ignatov-parc.github.io/igromir/game/')));

updates
	.filter(inlineQueries())
	.onValue(bot.reply(resultsReply([{
		type: 'game',
		id: `${Date.now()}`,
		game_short_name: 'runner_4game',
	}])));

process.on('exit', exitHandler);
process.on('SIGINT', exitHandler);
process.on('uncaughtException', exitHandler);

function exitHandler() {
	fs.writeFileSync(CACHE, JSON.stringify(cache));
}
