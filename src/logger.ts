import chalk from "chalk";

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4,
    silly: 5,
};

type LogLevel = keyof typeof levels;

let logLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info"; // Change the log level as per the requirements

const log = (level: LogLevel, ...messages: any[]) => {
    if (levels[level] <= levels[logLevel]) {
        const formattedMessage = messages.map((msg) => (typeof msg === "object" ? JSON.stringify(msg, null, 2) : msg)).join(" ");
        switch (level) {
            case "error":
                console.error(chalk.red(formattedMessage));
                break;
            case "warn":
                console.warn(chalk.yellow(formattedMessage));
                break;
            case "info":
                console.info(chalk.gray(formattedMessage));
                break;
            case "verbose":
                console.info(chalk.gray(formattedMessage));
                break;
            case "debug":
                console.info(chalk.gray(formattedMessage));
                break;
            default:
                console.log(chalk.gray(formattedMessage));
        }
    }
};

export default {
    setLogLevel: (level: LogLevel) => {
        logLevel = level;
    },
    error: (...msg: any[]) => log("error", ...msg),
    warn: (...msg: any[]) => log("warn", ...msg),
    info: (...msg: any[]) => log("info", ...msg),
    verbose: (...msg: any[]) => log("verbose", ...msg),
    debug: (...msg: any[]) => log("debug", ...msg),
    silly: (...msg: any[]) => log("silly", ...msg),
};