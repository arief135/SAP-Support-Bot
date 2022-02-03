import Telegraf, { ContextMessageUpdate } from "telegraf";
import * as config from "./config";
import http from 'http';

const bot = new Telegraf(config.BOT_TOKEN);

bot.use(Telegraf.log());

bot.on('message', async function (ctx: ContextMessageUpdate) {

    let options: http.RequestOptions = {
        host: 'localhost',
        port: 3000,
        path: config.WEBHOOK_PATH,
        method: 'POST',
        
    };

    let request = http.request(options, function (res) {
        console.log('STATUS: ' + res.statusCode);
        console.log('HEADERS: ' + JSON.stringify(res.headers));
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            console.log('BODY: ' + chunk);
        });
    });

    request.write(JSON.stringify(ctx.update))
    request.end();
});

bot.launch();
