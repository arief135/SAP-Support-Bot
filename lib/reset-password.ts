import { BotFSM, HandlerResult } from "./bot-fsm";
import { ContextMessageUpdate, Markup } from "telegraf";
import MessageStore from '../messages';
import Db, { SAPUser, Ticket } from './database'
import { Rfc } from "./rfc";
import nodemailer from "nodemailer";
import { SMTP, MailInitiaPasswordTemplate, CUSTOMER_NO, SAP_LOGON_LABEL, MailResetPassVerifiyCodeTemplate } from "../config";
import util from "./util";
import { Logger } from "./logger";

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

export class ResetPassword extends BotFSM {
    constructor() {
        super('/resetpass');

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
                    text: MessageStore.getMessage(['ResetPassword', 'Start'])
                },
                {
                    text: MessageStore.getMessage(['ResetPassword', 'YourUserId'])
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
                messages: [{ text: MessageStore.getMessage(['ResetPassword', 'YourEmail']) }]
            }
        } else {
            return {
                nextState: BotFSM.InitialState,
                stateData: stateData,
                messages: [
                    {
                        text: MessageStore.getMessage(['ResetPassword', 'UserNotFound'], [userId])
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
                        ['ResetPassword', 'EmailNotFound'],
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
                    text: MessageStore.getMessage(['ResetPassword', 'YourSAPServer']),
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
                    text: MessageStore.getMessage(['ResetPassword', 'ResetFailed'])
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
                            text: MessageStore.getMessage(['ResetPassword', 'InvalidVerificationCode'])
                        },
                        {
                            text: MessageStore.getMessage(['ResetPassword', 'InvalidVerificationCode2'], [`${3 - verificationCount}`])
                        }
                    ]
                }
            }
            else {
                return {
                    nextState: BotFSM.InitialState,
                    stateData: stateData,
                    messages: [{
                        text: MessageStore.getMessage(['ResetPassword', 'MaximumVerificationCount'], [this.command])
                    }]
                }
            }
        } else {
            // PERFORM reset password
            // ctx.reply(MessageStore.getMessage(['ResetPassword', 'PleaseWait']));

            try {
                let unlockUser: boolean = stateData.get(SessionDataKey.UnlockUser) || false;

                let initialPassword = await Rfc.resetPassword(sessionSAPUser, sessionSAPServer, unlockUser);

                Logger.info(`Generated Initial Password ${initialPassword}`);

                this._sendInitialPassword(initialPassword, sessionEmail, sessionSAPUser, sessionFullname);

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
                        text: MessageStore.getMessage(['ResetPassword', 'ResetSuccessful'])
                    }]
                }
            } catch (error) {
                Logger.error(error);

                return {
                    nextState: BotFSM.InitialState,
                    stateData: stateData,
                    messages: [{
                        text: MessageStore.getMessage(['ResetPassword', 'ResetFailed'])
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
                messages: [{ text: MessageStore.getMessage(['ResetPassword', 'UserInvalid']) }]
            }

        }

        if (sapUserDetail.ISLOCKED.WRNG_LOGON == 'L') {
            stateData.set(SessionDataKey.UnlockUser, true);
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
                    messages: [{ text: MessageStore.getMessage(['ResetPassword', 'UserInvalid']) }]
                }
            }
        }


        let code = util.generateVerificationCode();

        this._sendVerificationCode(sapUser, sapUserDetail, code);

        // create open ticket to Solman
        let solmanTicket: string = '';
        try {
            solmanTicket = await Rfc.createTicket(CUSTOMER_NO[sapUser.server], sapUser.userId, ctx.from, 'RESETPASS');
            let localTicket: Ticket = {
                email: email,
                sapServer: sapUser.server,
                sapUserId: sapUser.userId,
                solmanTicket: solmanTicket,
                solmanTicketStatus: '0',
                timestamp: new Date().getTime(),
                requestedBy: ctx.from,
                category: "RESETPASS"
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
            messages: [{ text: MessageStore.getMessage(['ResetPassword', 'YourVerificationCode']) }]
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
            subject: 'Kode Verifikasi Reset Password',
            html: util.composeMail(MailResetPassVerifiyCodeTemplate, params)
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

    private _sendInitialPassword(initialPassword: string, email: string, userId: string, fullName: string) {
        let params = new Map<string, string>();

        params.set('@FullName', fullName);
        params.set('@SAPUser', userId);
        params.set('@InitialPassword', util.escapeHtml(initialPassword));

        let mailOptions = {
            from: SMTP.auth?.user,
            to: email,
            subject: 'Initial Password',
            html: util.composeMail(MailInitiaPasswordTemplate, params)
        };

        try {
            let transporter = nodemailer.createTransport(SMTP);

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