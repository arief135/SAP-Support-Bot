import { BotFSM, HandlerResult } from "./bot-fsm";
import { ContextMessageUpdate, Markup } from "telegraf";
import MessageStore from '../messages';
import { SAP_LOGON } from "../config";
import { Rfc } from "./rfc";
import Db from './database'
import Bluebird = require("bluebird");
import pm2 from "pm2";
import { Logger, MemoryLog } from "./logger";

export class Administration extends BotFSM {
    constructor() {
        super('/admin')

        this.onMessage(BotFSM.InitialState, (message: string, ctx: ContextMessageUpdate, stateData: Map<string, any>) => {
            return {
                nextState: BotFSM.InitialState,
                stateData: stateData,
                messages: [{
                    text: MessageStore.getMessage(['Administration', 'Welcome'])
                }]
            }
        });
    }
}

enum SyncSAPUserState {
    WaitForSAPServer
}

export class SyncSAPUser extends BotFSM {
    constructor() {
        super('/syncsapuser')

        this.onMessage(BotFSM.InitialState, this.onStarted.bind(this));
        this.onMessage(SyncSAPUserState.WaitForSAPServer, this.onWaitForSAPServer.bind(this));
    }

    onStarted(message: string, ctx: ContextMessageUpdate, stateData: Map<string, any>): HandlerResult {
        let callbackButons = Array.from(SAP_LOGON.keys())
            .filter(x => x != 'MSYS_SOLMAN')
            .map(x => Markup.callbackButton(x, x));

        return {
            nextState: SyncSAPUserState.WaitForSAPServer,
            stateData: stateData,
            messages: [{
                text: MessageStore.getMessage(['Administration', 'YourSAPServer']),
                extra: Markup.inlineKeyboard(callbackButons).resize().extra()
            }]
        }
    }

    async onWaitForSAPServer(sapServer: string, ctx: ContextMessageUpdate, stateData: Map<string, any>): Promise<HandlerResult> {
        let userCount: number = 0;

        await ctx.reply(MessageStore.getMessage(['General', 'PleaseWait']));

        try {
            userCount = await Rfc.getUserList(sapServer).then(async function (userList: any) {

                await Db.clearSAPUser(sapServer);

                await Bluebird.Promise.map(
                    userList.USERLIST,
                    (x: any) => Db.saveSAPUser({
                        userId: x.USERNAME,
                        server: sapServer
                    })
                );

                return userList.USERLIST.length;
            })
        } catch (error) {

            return {
                nextState: BotFSM.InitialState,
                stateData: stateData,
                messages: [{
                    text: JSON.stringify(error)
                }]
            }
        }


        return {
            nextState: BotFSM.InitialState,
            stateData: stateData,
            messages: [{
                text: MessageStore.getMessage(['Administration', 'SyncComplete'], [sapServer, userCount + ''])
            }]
        }
    }
}


enum RestartState {
    WaitForAnswer
}

export class Restart extends BotFSM {
    constructor() {
        super('/restartbot');

        this.onMessage(BotFSM.InitialState, this.onStarted.bind(this));
        this.onMessage(RestartState.WaitForAnswer, this.onWaitForAnswer.bind(this));
    }

    onStarted(message: string, ctx: ContextMessageUpdate, stateData: Map<string, any>): HandlerResult {

        let callbackButtons = [
            MessageStore.getMessage(['Administration', 'AnswerYes']),
            MessageStore.getMessage(['Administration', 'AnswerNo'])
        ].map(x => Markup.callbackButton(x, x));

        return {
            nextState: RestartState.WaitForAnswer,
            stateData: stateData,
            messages: [{
                text: MessageStore.getMessage(['Administration', 'RestartConfirm']),
                extra: Markup.inlineKeyboard(callbackButtons).resize().extra()
            }]
        }
    }

    async onWaitForAnswer(answer: string, ctx: ContextMessageUpdate, stateData: Map<string, any>): Promise<HandlerResult> {
        answer = answer.toUpperCase();

        let yes = MessageStore.getMessage(['Administration', 'AnswerYes']);
        let no = MessageStore.getMessage(['Administration', 'AnswerNo']);

        if (answer == yes) {

            let status = false;


            try {
                // clear session to igonore repeated message
                let userSession = await BotFSM.getSession(ctx);
                userSession.state = BotFSM.InitialState;
                await Db.setSession(userSession);

                status = await new Promise<boolean>(function (resolve, reject) {
                    pm2.connect(function (error) {
                        if (error) {
                            reject(error);
                        }

                        pm2.restart('sap-bot1', function (error) {
                            pm2.disconnect();
                            if (error) {
                                reject(error);
                            }

                            resolve(true);
                        })
                    });
                })
            } catch (error) {
                Logger.error(error);
            }

            if (status) {
                return {
                    nextState: BotFSM.InitialState,
                    stateData: stateData,
                    messages: [{
                        text: MessageStore.getMessage(['Administration', 'RestartSuccessful'])
                    }]
                }

            } else {
                return {
                    nextState: BotFSM.InitialState,
                    stateData: stateData,
                    messages: [{
                        text: MessageStore.getMessage(['Administration', 'RestartFailed'])
                    }]
                }

            }

        } else if (answer == no) {

            return {
                nextState: BotFSM.InitialState,
                stateData: stateData,
                messages: [{
                    text: MessageStore.getMessage(['Administration', 'RestartCanceled'])
                }]
            }
        } else {

            return {
                nextState: RestartState.WaitForAnswer,
                stateData: stateData,
                messages: [{
                    text: MessageStore.getMessage(['Administration', 'RestartConfirm'])
                }]
            }
        }
    }
}

export class ReadLogs extends BotFSM {
    constructor() {
        super('/readlogs');
        this.onMessage(BotFSM.InitialState, this.onStarted.bind(this));
    }

    onStarted(message: string, ctx: ContextMessageUpdate, stateData: Map<string, any>): HandlerResult {

        return {
            nextState: BotFSM.InitialState,
            stateData: stateData,
            messages: [
                {
                    text: MemoryLog.getLogs().join('\r\n') || 'Empty Log'
                }
            ]
        }
    }
}