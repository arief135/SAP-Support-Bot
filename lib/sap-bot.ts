import Telegraf, { ContextMessageUpdate } from "telegraf";
import { ResetPassword } from "./reset-password";
import MSG from '../messages';
import { BotMessage, BotFSM } from "./bot-fsm";
import DB from "./database";
import { UnlockUid } from "./unlock-uid";
import { Administration, SyncSAPUser, Restart, ReadLogs } from "./administration";
import util from "./util";

export class SAPBot {

    private adminProcessors: BotFSM[] = [new Administration(), new SyncSAPUser(), new Restart(), new ReadLogs()];
    private processors: BotFSM[] = [new ResetPassword(), new UnlockUid()];

    private adminProcessorMap: Map<string, BotFSM>;
    private processorMap: Map<string, BotFSM>;

    constructor(private bot: Telegraf<ContextMessageUpdate>) {
        this.processorMap = new Map();
        this.processors.forEach(x => {
            this.processorMap.set(x.command, x);
        });

        this.adminProcessorMap = new Map();
        this.adminProcessors.forEach(x => {
            this.adminProcessorMap.set(x.command, x);
        });
    }

    async determineResponse(message: string, ctx: ContextMessageUpdate) {
        let session = await BotFSM.getSession(ctx);

        let processor: BotFSM | undefined = undefined;

        if (util.isAdmin(ctx.from?.id || 0)) {
            processor = this.adminProcessorMap.get(session.command);
        }

        if (!processor) {
            processor = this.processorMap.get(session.command);
        }

        if (processor) {
            return processor.process(message, ctx, session);
        } else {
            await DB.setSession(session);
            return this.getWelcomeMessage();
        }
    }

    getWelcomeMessage() {
        let botMessage: BotMessage = {
            text: MSG.getMessage(['General', 'Welcome'])
        }
        return [botMessage];
    }

}
