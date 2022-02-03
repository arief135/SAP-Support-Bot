import mongoose from 'mongoose';
import * as config from '../config';
import { User } from 'telegraf/typings/telegram-types';
import { Logger } from './logger';

/****************************************************************************/
/* UserSession                                                              */
/****************************************************************************/

export interface UserSession {
    _id: number,
    user?: User,
    createdOn: number,
    command: string,
    state: number,
    stateData: Map<string, string>
}

const userSessionSchema = new mongoose.Schema({
    _id: Number,
    user: mongoose.Schema.Types.Mixed,
    createdOn: Number,
    command: String,
    state: Number,
    stateData: Map
});

export const UserSessionModel = mongoose.model<UserSession & mongoose.Document>('UserSession', userSessionSchema);

/****************************************************************************/
/* SAPUser                                                                  */
/****************************************************************************/

export interface SAPUser {
    userId: string,
    server: string
}

const sapUserSchema = new mongoose.Schema({
    userId: String,
    server: String
});

export const SapUserModel = mongoose.model<SAPUser & mongoose.Document>('SAPUser', sapUserSchema);


/****************************************************************************/
/* Ticket                                                                   */
/****************************************************************************/
export interface Ticket {
    timestamp: number,
    requestedBy?: User,
    sapUserId: string,
    sapServer: string,
    email: string,
    solmanTicket: string,
    solmanTicketStatus: string,
    category: 'RESETPASS' | 'UNLOCKUID'
}

const ticketSchema = new mongoose.Schema({
    timestamp: Number,
    requestedBy: mongoose.Schema.Types.Mixed,
    sapUserId: String,
    sapServer: String,
    email: String,
    solmanTicket: String,
    solmanTicketStatus: String,
    category: String
});

export const TicketModel = mongoose.model<Ticket & mongoose.Document>('Ticket', ticketSchema);


/****************************************************************************/
/* Export Default                                                           */
/****************************************************************************/

const connection = mongoose.connect(config.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false
});

connection.then(() => {
    console.log('DB connected')
});

connection.catch(e => {
    Logger.error('DB error', e);
    process.exit(1);
});

export default {
    getSession: async function (id: number): Promise<UserSession> {
        return <UserSession>await UserSessionModel.findById(id).exec();
    },
    // Create or Update
    setSession: async function (session: UserSession) {
        let sess = await UserSessionModel.findById(session._id).exec();

        if (sess) {
            await UserSessionModel.findByIdAndUpdate(session._id, session).exec();
        } else {
            await new UserSessionModel(session).save();
        }
    },
    getSAPUser: async function (userId: string) {
        let query: any = {
            userId: userId
        };

        return <SAPUser[]>await SapUserModel.find(query).exec();
    },
    clearSAPUser: async function (sapServer: string) {
        let condition = {
            server: sapServer
        }

        return SapUserModel.deleteMany(condition).exec();
    },
    saveSAPUser: async function (sapUser: SAPUser) {
        let search = await SapUserModel.findOne(sapUser);

        if (!search) {
            await new SapUserModel(sapUser).save();
        }
    },
    createTicket: function (ticket: Ticket) {
        new TicketModel(ticket).save();
    },
    closeTicket: async function (solmanTicket: string, sapServer: string) {
        let query = {
            solmanTicket: solmanTicket,
            sapServer: sapServer
        };

        let search = await TicketModel.findOne(query);

        if (search) {
            search.timestamp = new Date().getTime();
            search.solmanTicketStatus = '1';

            await TicketModel.updateOne(query, search).exec();
        }
    }
}
