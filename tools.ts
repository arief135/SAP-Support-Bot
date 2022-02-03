import yargs from 'yargs';
import { Rfc } from './lib/rfc';
import Db from './lib/database';
import Bluebird from 'bluebird';
import mongoose from 'mongoose';
import { SAP_LOGON } from './config';

const sync = 's';

yargs
    .option(sync, {
        describe: 'Synchronize SAP Users',
        type: 'string',
        demandOption: true
    });

let sapServer: string = <string>yargs.argv[sync];

if (!sapServer) {
    let serverListStr = Array.from(SAP_LOGON.keys())
        .filter(x => x != 'MSYS_SOLMAN')
        .join('|');
    
    serverListStr = serverListStr.length > 0 ? serverListStr + '|all': serverListStr;

    console.error(`Please specify SAP Server: [${serverListStr}]`);
    mongoose.disconnect();

} else {

    let sapServers: string[] = [];

    if (sapServer == 'all') {
        SAP_LOGON.forEach((v, k) => {
            if (k != 'MSYS_SOLMAN') {
                sapServers.push(k);
            }
        });
    } else {
        sapServers.push(sapServer);
    }

    let allRfcCall = sapServers.map(sapServer => {
        return Rfc.getUserList(sapServer).then(async function (userList: any) {

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
            .then(function (count: number) {
                console.info(`${sapServer}/${count}`);
            })
            .catch(function (error) {
                console.error(error);
            })
    });

    Promise.all(allRfcCall).then(x => mongoose.disconnect());
}

