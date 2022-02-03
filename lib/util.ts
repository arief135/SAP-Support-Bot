import { ADMINISTRATORS } from "../config";

export default {
    composeMail: function (template: string, params: Map<string, string>) {
        let mailContent = template;
        params.forEach((value, key) => {
            mailContent = mailContent.replace(key, value);
        });
        return mailContent;
    },
    generateVerificationCode(len: number = 5) {
        let code = '';
        for (let i = 0; i < len; i++) {
            code = code + Math.floor(Math.random() * 10);
        }
        return code;
    },
    escapeHtml(text: string): string {
        let map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };

        return text.replace(/[&<>"']/g, (m: string) => map[m]);
    },
    isAdmin(id: number): boolean {

        if (ADMINISTRATORS) {
            
            let ids = id + '';
            
            if (ADMINISTRATORS.find(x => x == ids)) {
                return true;
            } else {
                return false;
            }
        }

        return false;
    }
};