import { ContextMessageUpdate } from "telegraf";
import DB, { UserSession } from "./database";
import { ExtraReplyMessage } from "telegraf/typings/telegram-types";
import MessageStore from '../messages';

export interface BotMessage {
    text: string,
    extra?: ExtraReplyMessage
}

export interface HandlerResult {
    nextState: number,
    stateData: Map<string, string>
    messages: BotMessage[]
}

type MessageHandler = (message: string, ctx: ContextMessageUpdate, stateData: Map<string, any>) => HandlerResult | Promise<HandlerResult>;

export interface FSMListener {
    state: number,
    handler: MessageHandler
}

export class BotFSM {

    static InitialState = 999;

    private fsmListenerList: Array<FSMListener> = new Array();

    /**
     *
     */
    constructor(public command: string) {
    }

    onMessage(currentState: number, handler: MessageHandler): BotFSM {
        this.fsmListenerList.push({ state: currentState, handler: handler });
        return this;
    }

    async process(message: string, ctx: ContextMessageUpdate, session: UserSession) {

        let listener = this.fsmListenerList.find((x) => x.state == session.state);

        if (listener) {
            let result = await listener.handler(message, ctx, session.stateData);

            session.state = result.nextState;
            session.stateData = result.stateData;
            session.createdOn = new Date().getTime();

            //UPDATE session
            await DB.setSession(session);

            return result.messages;

        } else {
            throw `Unhandled state ${session.state} on command ${this.command}`;
        }
    }

    static async getSession(ctx: ContextMessageUpdate) {
        let userId: number = ctx.from?.id || 0;

        let session = await DB.getSession(userId);
        let text = ctx.message?.text || '';
        let commandEntity = ctx.message?.entities?.find((e) => e.type == 'bot_command');

        let invalidate = !session
            || commandEntity !== undefined
            || ((new Date().getTime() - session.createdOn) > 86400000)
            || session.state == BotFSM.InitialState;

        if (invalidate) {
            // CREATE initial session
            session = {
                _id: userId,
                user: ctx.from,
                command: commandEntity ? text : '',
                createdOn: new Date().getTime(),
                state: BotFSM.InitialState,
                stateData: new Map()
            };
        }

        return session;
    }

    protected defaultResult(): HandlerResult {
        return {
            nextState: BotFSM.InitialState,
            stateData: new Map<string, string>(),
            messages: [
                {
                    text: MessageStore.getMessage(['General', 'Welcome'])
                }
            ]
        }
    }

}