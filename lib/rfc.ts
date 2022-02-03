import { Client } from "node-rfc";
import * as config from '../config';
import { User } from "telegraf/typings/telegram-types";

export const Rfc = {
    getUserDetail: async function (userName: string, sapSystem: string) {
        var sapProp = config.SAP_LOGON.get(sapSystem);

        if (!sapProp) {
            throw 'Invalid SAP Server';
        }

        var bapiInput = {
            USERNAME: userName,
            CACHE_RESULTS: ''
        };

        var client = new Client(sapProp);
        await client.open();
        let response = await client.call('BAPI_USER_GET_DETAIL', bapiInput);
        await client.close();

        return response;
    },
    resetPassword: async function (userName: string, sapSystem: string, unlock: boolean = false) {
        var sapProp = config.SAP_LOGON.get(sapSystem);

        if (!sapProp) {
            throw 'Invalid SAP Server';
        }

        var bapiInput = {
            USERNAME: userName,
            GENERATE_PWD: 'X',
            PASSWORDX: {
                BAPIPWD: 'X'
            }
        };

        var client = new Client(sapProp);

        await client.open();

        let response: any = await client.call('BAPI_USER_CHANGE', bapiInput);

        if (unlock) {
            let unlockResponse: any = await client.call('BAPI_USER_UNLOCK', { USERNAME: userName });

            if (unlockResponse.RETURN.find((x: any) => x.TYPE == 'E')) {
                await client.call('BAPI_TRANSACTION_ROLLBACK', {});
                throw unlockResponse.RETURN;
            }

            await client.call('BAPI_TRANSACTION_COMMIT', { WAIT: 'X' });
        }

        client.close();

        let errorExist = response.RETURN.find((x: any) => x.TYPE == 'E');
        if (errorExist) {
            throw response.RETURN;
        }

        return response.GENERATED_PASSWORD.BAPIPWD;
    },
    getUserList: async function (sapSystem: string) {
        let sapLogon = config.SAP_LOGON.get(sapSystem);

        if (!sapLogon) {
            throw "Invalid SAP Logon";
        }

        let client = new Client(sapLogon);

        await client.open();
        let response = await client.call('BAPI_USER_GETLIST', {});
        client.close();

        return response;
    },
    createTicket: async function (
        custNo: string,
        sapUserId: string,
        requestedBy: User | undefined,
        category: 'RESETPASS' | 'UNLOCKUID') {

        let sapLogon = config.SAP_LOGON.get('MSYS_SOLMAN');

        if (!sapLogon) {
            throw "Invalid SAP Logon";
        }

        let client = new Client(sapLogon);

        await client.open();

        let teleUserName = (requestedBy?.username ?? requestedBy?.id) || '';
        let teleFullName = `${requestedBy?.first_name} ${requestedBy?.last_name}`;

        let bapiInput = {
            TICKET_NO: '',
            CUSTOMER: custNo,
            REPORTER: sapUserId,
            CATEGORY: category,
            STATUS: '0',
            DESCRIPTION: `Req. by ${teleUserName}/${teleFullName}`
        };

        let response: any = await client.call('ZTICKET_RESET_PASS', bapiInput);
        client.close();

        return response.E_TICKET_NO;
    },
    closeTicket: async function (solmanTicket: string, custNo: string) {
        let sapLogon = config.SAP_LOGON.get('MSYS_SOLMAN');

        if (!sapLogon) {
            throw "Invalid SAP Logon";
        }

        let client = new Client(sapLogon);

        await client.open();

        let bapiInput = {
            TICKET_NO: solmanTicket,
            CUSTOMER: custNo,
            STATUS: '1'
        };

        let response: any = await client.call('ZTICKET_RESET_PASS', bapiInput);
        client.close();

        if (response.E_MESSAGE.FELD1) {
            throw response;
        }

        return response;
    },
    unlockUser: async function (userName: string, sapSystem: string) {
        var sapProp = config.SAP_LOGON.get(sapSystem);

        if (!sapProp) {
            throw 'Invalid SAP Server';
        }

        var client = new Client(sapProp);

        await client.open();

        let unlockResponse: any = await client.call('BAPI_USER_UNLOCK', { USERNAME: userName });

        if (unlockResponse.RETURN.find((x: any) => x.TYPE == 'E')) {
            await client.call('BAPI_TRANSACTION_ROLLBACK', {});
            throw unlockResponse.RETURN;
        }

        await client.call('BAPI_TRANSACTION_COMMIT', { WAIT: 'X' });

        client.close();

        return true;
    }
}
