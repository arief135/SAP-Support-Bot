import Telegraf, { ContextMessageUpdate } from 'telegraf';
import { SAPBot } from './lib/sap-bot';
import * as config from './config';
import { Logger } from './lib/logger';

const bot = new Telegraf(config.BOT_TOKEN, { telegram: { webhookReply: false } });
var sapBot = new SAPBot(bot);

if (process.env.NODE_ENV == 'development') {
    bot.use(Telegraf.log());

    bot.use((ctx: ContextMessageUpdate, next: any) => {
        if (ctx.message) {
            console.log(ctx.message.chat.username, ctx.message.text);
        }

        return next();
    });
}

bot.on(['message', 'callback_query'], async function (ctx: ContextMessageUpdate) {

    let text: string;

    if (ctx.message) {
        text = ctx.message.text || '';
    } else {
        text = ctx.callbackQuery?.data || '';
    }

    var response = await sapBot.determineResponse(text, ctx);

    if (response == undefined) {
        return;
    }

    for (let i = 0; i < response.length; i++) {
        const r = response[i];
        try {
            await ctx.replyWithHTML(r.text, r.extra);
        } catch (error) {
            Logger.error("Error Replying", error);
        }
    }
});

// bot.startWebhook(config.WEBHOOK_PATH, null, 3000);
bot.launch();
