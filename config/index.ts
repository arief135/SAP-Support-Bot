import { RfcConnectionParameters } from "node-rfc";
import * as fs from "fs";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: `${__dirname}${path.sep}.env` });

export const BOT_TOKEN: string = process.env.BOT_TOKEN || '';

export const MONGODB_URI: string = `mongodb://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@localhost:27017/sap-bot?authSource=admin&w=1`;

export const WEBHOOK_PATH: string = `/bot1/${BOT_TOKEN}`;
export const WEBHOOK_HOST: string = 'https://websap.metrasys.co.id';

export const SMTP: SMTPTransport.Options = {
    host: "mail.sigma.co.id",
    port: 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
}

export const MailResetPassVerifiyCodeTemplate = fs.readFileSync(`${__dirname}${path.sep}mail.resetPassVerificationCode.template.html`).toString();
export const MailInitiaPasswordTemplate = fs.readFileSync(`${__dirname}${path.sep}mail.initialPassword.template.html`).toString();
export const MailUnlockVerifiyCodeTemplate = fs.readFileSync(`${__dirname}${path.sep}mail.unlockVerificationCode.template.html`).toString();

export const ADMINISTRATORS = process.env.ADMIN_ID?.split(',');

export const SAP_LOGON = new Map<string, RfcConnectionParameters>();
export let SAP_LOGON_LABEL: { [key: string]: string } = {};
export let CUSTOMER_NO: { [key: string]: string } = {};

process.env.SAP_LOGON_PREFIX?.split(',').forEach(x => {
    x = x.trim();

    let logonProp: RfcConnectionParameters = {
        ashost: process.env[`${x}_HOST`],
        sysnr: process.env[`${x}_SYSNR`],
        saprouter: process.env[`${x}_SAPROUTER`],
        client: process.env[`${x}_CLIENT`] || '',
        user: process.env[`${x}_USER`],
        passwd: process.env[`${x}_PASSWORD`]
    };

    SAP_LOGON.set(x, logonProp);
    SAP_LOGON_LABEL[x] = process.env[`${x}_LABEL`] || '';
    CUSTOMER_NO[x] = process.env[`${x}_CUSTNO`] || '';
})
