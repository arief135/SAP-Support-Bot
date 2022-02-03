import Bluebird from 'bluebird';
import { Client } from 'node-rfc';
import * as config from '../config';
import { Rfc } from '../lib/rfc';

test('Check SAP Connection', async () => {
	await Bluebird.Promise.map(
		config.SAP_LOGON,
		([x, sapProp]) => new Client(sapProp).open())
});

test('Get SAP Users', async () => {
	let users = await Rfc.getUserList('MSYS_SOLMAN')
	expect(users).toBeDefined();
})