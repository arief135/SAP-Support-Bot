import winston, { format } from "winston";
import Transport from "winston-transport";
import fs from 'fs';
import readline from 'readline';

class MemoryTransport extends Transport {

    private data: string[] = [];

    constructor(private threshold: number = 10) {
        super();

        // FIND log file
        let fileName = this._getLogFile();

        if (fileName) {
            let readStream = fs.createReadStream(fileName);
            let readInterface:readline.Interface = readline.createInterface({ input: readStream });
            
            let that = this;
            readInterface.on('line', function (line:string) {
                that.data.push(line);
                if (that.data.length > that.threshold) {
                    that.data.shift();
                }
            });

            readInterface.on('close', function () {
                readStream.close();
            })
        }
    }

    log(info: any, callback: any) {
        let messageSymbol = Object.getOwnPropertySymbols(info)[1];

        if (!info[messageSymbol]) {
            return;
        }

        this.data.push(info[messageSymbol]);

        if (this.data.length > this.threshold) {
            this.data.shift();
        }

        callback();
    }

    getLogs() {
        return this.data;
        // return this.data.map((v, i) => this.data[this.data.length - i - 1]);
    }

    private _getLogFile() {

        function proposeName(dir: string, file: string, extension: string, counter: number) {
            let suffix = '';
            if (counter > 0) {
                suffix = counter + '';
            }

            return `${dir}/${file}${suffix}.${extension}`;
        }

        let found = true;
        let counter = 0;
        let lastExistName = '';

        while (found) {
            let name = proposeName('logs', 'log', 'txt', counter);
            if (fs.existsSync(name)) {
                lastExistName = name;
                counter++;
            } else {
                found = false;
            }
        }

        return lastExistName;
    }

}

export const MemoryLog = new MemoryTransport();

export const Logger = winston.createLogger({
    level: 'info',
    format: format.combine(
        format.splat(),
        format.timestamp(),
        format.printf(
            ({ level, message, timestamp }) => {
                if (typeof (message) == 'object') {
                    message = JSON.stringify(message);
                }
                return `[${level}] ${timestamp}: ${message}`;
            })),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            dirname: 'logs',
            filename: 'log.txt',
            maxsize: 1000000
        }),
        MemoryLog
    ]
});
