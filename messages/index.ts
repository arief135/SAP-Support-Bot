let locale = 'id-ID';
let moduleName = `./messages.${locale}`;

let messageImport = require(moduleName);

export default {
    getMessage: function (keys: string[], params?: string[]) {
        let msg = messageImport['default'];

        let messageStore: any = msg;
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            messageStore = messageStore[k];
        }

        let text: string = messageStore;

        if (params) {
            for (let k in params) {
                text = text.replace("{" + k + "}", params[k]);
            }
        }

        return text;
    }
}
