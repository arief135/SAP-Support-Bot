import { BotFSM, HandlerResult } from "./bot-fsm";
import { ContextMessageUpdate, Markup } from "telegraf";
import MessageStore from '../messages';
import Db, { SAPUser, Ticket } from './database'
import { Logger } from "./logger";
import { Rfc } from "./rfc";
import { SAP_LOGON_LABEL, CUSTOMER_NO, SMTP, MailUnlockVerifiyCodeTemplate } from "../config";
import util from "./util";
import nodemailer from "nodemailer";

const enum States {
    WaitForUserID, WaitForEmail, WaitForSAPServer, WaitForVerificationCode
}

const enum SessionDataKey {
    SAPUser = 'SAPUser',
    SAPServer = 'SAPServer',
    Email = 'Email',
    VerificationCode = 'VerificationCode',
    VerificationCount = 'VerificationCount',
    FullName = 'FullName',
    SolmanTicket = "SolmanTicket",
    SelectedUsers = "SelectedUsers",
    UnlockUser = "UnlockUser"
}

export class UnlockUid extends BotFSM {
    constructor() {
        super('/unlockuid');

        this.onMessage(BotFSM.InitialState, this.onStarted.bind(this))
            .onMessage(States.WaitForUserID, this.onWaitForUserID.bind(this))
            .onMessage(States.WaitForEmail, this.onWaitForEmail.bind(this))
            .onMessage(States.WaitForSAPServer, this.onWaitForSAPServer.bind(this))
            .onMessage(States.WaitForVerificationCode, this.onWaitForVerificationCode.bind(this));
    }

    async onStarted(message: string, ctx: ContextMessageUpdate, stateData: Map<string, any>): Promise<HandlerResult> {
        return {
            nextState: States.WaitForUserID,
            stateData: stateData,
            messages: [
                {
                    text: MessageStore.getMessage(['UnlockUserID', 'Start'])
                },
                {
                    text: MessageStore.getMessage(['UnlockUserID', 'YourUserId'])
                }
            ]
        }
    }

    async onWaitForUserID(userId: string, ctx: ContextMessageUpdate, stateData: Map<string, any>): Promise<HandlerResult> {
        // CHECK user
        userId = userId.toUpperCase();
        let sapUsers = await Db.getSAPUser(userId);

        if (sapUsers.length > 0) {
            stateData.set(SessionDataKey.SAPUser, userId);

            return {
                nextState: States.WaitForEmail,
                stateData: stateData,
                messages: [{ text: MessageStore.getMessage(['UnlockUserID', 'YourEmail']) }]
            }
        } else {
            return {
                nextState: BotFSM.InitialState,
                stateData: stateData,
                messages: [
                    {
                        text: MessageStore.getMessage(['UnlockUserID', 'UserNotFound'], [userId])
                    }
                ]
            }
        }
    }

    async onWaitForEmail(email: string, ctx: ContextMessageUpdate, stateData: Map<string, any>): Promise<HandlerResult> {
        // CHECK user
        let userId = stateData.get(SessionDataKey.SAPUser);

        if (!userId) {
            Logger.error('Invalid Session Data: %s', stateData);
            return this.defaultResult();
        }

        // ctx.reply(MessageStore.getMessage(['ResetPassword', 'PleaseWait']));

        let sapUsers = await Db.getSAPUser(userId);
        let selectedUsers: [SAPUser, any][] = [];

        try {
            let userDetails: any = await Promise.all(sapUsers.map(x => Rfc.getUserDetail(x.userId, x.server)));
            selectedUsers = sapUsers
                .map((x, i): [SAPUser, any] => [x, userDetails[i]])
                .filter(x => x[1].ADDRESS.E_MAIL == email);

        } catch (error) {
            Logger.error(error);
        }

        if (selectedUsers.length == 0) {
            stateData.clear();
            return {
                nextState: BotFSM.InitialState,
                stateData: stateData,
                messages: [{
                    text: MessageStore.getMessage(
                        ['UnlockUserID', 'EmailNotFound'],
                        [email, userId])
                }]
            }

        } else if (selectedUsers.length == 1) {
            let [sapUser, sapUserDetail] = selectedUsers[0];

            return this._verificationCodeResultHandler(
                sapUser,
                sapUserDetail,
                email,
                ctx,
                stateData);

        } else { // selectedUsers.length > 1

            stateData.set(SessionDataKey.Email, email);
            stateData.set(SessionDataKey.SelectedUsers, selectedUsers);

            let callbackButons = selectedUsers.map(([x, y]: [SAPUser, any]) =>
                Markup.callbackButton(SAP_LOGON_LABEL[x.server], x.server));

            return {
                nextState: States.WaitForSAPServer,
                stateData: stateData,
                messages: [{
                    text: MessageStore.getMessage(['UnlockUserID', 'YourSAPServer']),
                    extra: Markup.inlineKeyboard(callbackButons).resize().extra()
                }]
            }
        }

    }

    async onWaitForSAPServer(sapServer: string, ctx: ContextMessageUpdate, stateData: Map<string, any>): Promise<HandlerResult> {
        let selectedUsers: [SAPUser, any][] = stateData.get(SessionDataKey.SelectedUsers);

        if (!selectedUsers) {
            Logger.error('Invalid Session Data: %s', stateData);
            return this.defaultResult();
        }

        let selectedUser = selectedUsers.find(([x, y]: [SAPUser, any]) => x.server == sapServer);
        if (!selectedUser) {
            Logger.error(`${sapServer} not found`, selectedUsers.map(x => x[0]));

            stateData.clear();
            return {
                nextState: BotFSM.InitialState,
                stateData: stateData,
                messages: [{
                    text: MessageStore.getMessage(['UnlockUserID', 'UnlockFailed'])
                }]
            }
        }

        let email = stateData.get(SessionDataKey.Email);

        let [sapUser, sapUserDetail] = selectedUser;

        return this._verificationCodeResultHandler(
            sapUser,
            sapUserDetail,
            email,
            ctx,
            stateData);
    }

    async onWaitForVerificationCode(verificationCode: string, ctx: ContextMessageUpdate, stateData: Map<string, any>): Promise<HandlerResult> {
        let sessionCode = stateData.get(SessionDataKey.VerificationCode);
        let sessionSAPUser = stateData.get(SessionDataKey.SAPUser);
        let sessionSAPServer = stateData.get(SessionDataKey.SAPServer);
        let sessionEmail = stateData.get(SessionDataKey.Email);
        let sessionFullname = stateData.get(SessionDataKey.FullName);

        if (!sessionCode
            || !sessionSAPUser
            || !sessionSAPServer
            || !sessionEmail
            || !sessionFullname) {

            Logger.error('Invalid Session Data: %s', stateData);
            return this.defaultResult();
        }


        if (sessionCode != verificationCode) {
            let verificationCount: number = stateData.get(SessionDataKey.VerificationCount) || 0;
            verificationCount = verificationCount + 1;

            if (verificationCount < 3) {
                stateData.set(SessionDataKey.VerificationCount, verificationCount);

                return {
                    nextState: States.WaitForVerificationCode,
                    stateData: stateData,
                    messages: [
                        {
                            text: MessageStore.getMessage(['UnlockUserID', 'InvalidVerificationCode'])
                        },
                        {
                            text: MessageStore.getMessage(['UnlockUserID', 'InvalidVerificationCode2'], [`${3 - verificationCount}`])
                        }
                    ]
                }
            }
            else {
                return {
                    nextState: BotFSM.InitialState,
                    stateData: stateData,
                    messages: [{
                        text: MessageStore.getMessage(['UnlockUserID', 'MaximumVerificationCount'], [this.command])
                    }]
                }
            }
        } else {
            // PERFORM unlock user

            try {
                await Rfc.unlockUser(sessionSAPUser, sessionSAPServer);

                let ticket: string = stateData.get(SessionDataKey.SolmanTicket);
                let custNo: string = CUSTOMER_NO[sessionSAPServer];

                Promise.all([
                    Rfc.closeTicket(ticket, custNo),
                    Db.closeTicket(ticket, sessionSAPServer)
                ]).catch(function (error) {
                    Logger.error(error);
                })

                return {
                    nextState: BotFSM.InitialState,
                    stateData: stateData,
                    messages: [{
                        text: MessageStore.getMessage(['UnlockUserID', 'UnlockSuccessful'], [sessionSAPUser])
                    }]
                }
            } catch (error) {
                Logger.error(error);

                return {
                    nextState: BotFSM.InitialState,
                    stateData: stateData,
                    messages: [{
                        text: MessageStore.getMessage(['UnlockUserID', 'UnlockFailed'])
                    }]
                }
            }
        }
    }

    private async _verificationCodeResultHandler(
        sapUser: SAPUser,
        sapUserDetail: any,
        email: string,
        ctx: ContextMessageUpdate,
        stateData: Map<string, any>): Promise<HandlerResult> {

        // check User lock status
        if (sapUserDetail.ISLOCKED.LOCAL_LOCK == 'L'
            || sapUserDetail.ISLOCKED.GLOB_LOCK == 'L') {

            stateData.clear();
            return {
                nextState: BotFSM.InitialState,
                stateData: stateData,
                messages: [{ text: MessageStore.getMessage(['UnlockUserID', 'UserInvalid']) }]
            }

        }

        // check User validity date
        if (sapUserDetail.LOGONDATA.GLTGB && sapUserDetail.LOGONDATA.GLTGB != '00000000') {

            let validityEndDate: string = sapUserDetail.LOGONDATA.GLTGB;

            let year: number = parseInt(validityEndDate.substr(0, 4));
            let month: number = parseInt(validityEndDate.substr(4, 2)) - 1;
            let date: number = parseInt(validityEndDate.substr(6, 2));

            if (new Date() > new Date(year, month, date)) {
                stateData.clear();
                return {
                    nextState: BotFSM.InitialState,
                    stateData: stateData,
                    messages: [{ text: MessageStore.getMessage(['UnlockUserID', 'UserInvalid']) }]
                }
            }
        }

        if (sapUserDetail.ISLOCKED.WRNG_LOGON == 'U') {
            stateData.clear();
            return {
                nextState: BotFSM.InitialState,
                stateData: stateData,
                messages: [{ text: MessageStore.getMessage(['UnlockUserID', 'UserAlreadyUnlocked'], [sapUser.userId]) }]
            }
        }


        let code = util.generateVerificationCode();

        this._sendVerificationCode(sapUser, sapUserDetail, code);

        // create open ticket to Solman
        let solmanTicket: string = '';
        try {
            solmanTicket = await Rfc.createTicket(CUSTOMER_NO[sapUser.server], sapUser.userId, ctx.from, 'UNLOCKUID');

            let localTicket: Ticket = {
                email: email,
                sapServer: sapUser.server,
                sapUserId: sapUser.userId,
                solmanTicket: solmanTicket,
                solmanTicketStatus: '0',
                timestamp: new Date().getTime(),
                requestedBy: ctx.from,
                category: "UNLOCKUID"
            }

            Db.createTicket(localTicket);
        } catch (error) {
            Logger.error(error);
        }


        stateData.delete(SessionDataKey.SelectedUsers);

        stateData.set(SessionDataKey.Email, email);
        stateData.set(SessionDataKey.VerificationCode, code);
        stateData.set(SessionDataKey.SAPServer, sapUser?.server);
        stateData.set(SessionDataKey.FullName, sapUserDetail.ADDRESS.FULLNAME ?? sapUser?.userId);
        stateData.set(SessionDataKey.SolmanTicket, solmanTicket);

        return {
            nextState: States.WaitForVerificationCode,
            stateData: stateData,
            messages: [{ text: MessageStore.getMessage(['UnlockUserID', 'YourVerificationCode']) }]
        }
    }

    private _sendVerificationCode(sapUser: SAPUser, sapUserDetail: any, code: string) {
        let email = sapUserDetail.ADDRESS.E_MAIL;

        Logger.info(`Verification Code ${code} sent to ${email}`);

        let transporter = nodemailer.createTransport(SMTP);
        let params = new Map<string, string>();

        params.set('@FullName', sapUserDetail.ADDRESS.FULLNAME || sapUser.userId);
        params.set('@SAPUser', sapUser.userId);
        params.set('@Server', SAP_LOGON_LABEL[sapUser.server]);
        params.set('@Code', code);

        let mailOptions = {
            from: SMTP.auth?.user,
            to: email,
            subject: 'Kode Verifikasi Unlock User',
            html: util.composeMail(MailUnlockVerifiyCodeTemplate, params)
        };

        try {
            transporter.sendMail(mailOptions, function (error, info) {
                if (error) {
                    Logger.error(error);
                } else {
                    Logger.info('Email sent: ' + info.response);
                }
            });
        } catch (error) {
            Logger.error(error);
        }
    }
} 