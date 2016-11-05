'use strict';

import Bot, {filters, replies} from './src/index';

const {command} = filters;
const {text} = replies;

const bot = new Bot('291551742:AAFfCsVbODy-R19Q50RzjYDTb39-6izv7bw');

const updates = bot.getUpdatesStream();

// updates.log(111);

updates
	.filter(command('ping'))
	.onValue(bot.reply(text('pong')));
