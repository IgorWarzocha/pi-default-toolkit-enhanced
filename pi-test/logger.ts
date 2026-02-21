 export enum LogLevel {
   DEBUG = 'DEBUG',
   INFO = 'INFO',
   WARNING = 'WARNING',
   ERROR = 'ERROR',
 }

 export class Logger {
   private level: LogLevel;

   constructor(level: LogLevel = LogLevel.INFO) {
     this.level = level;
   }

   debug(msg: string): void {
     this.log(LogLevel.DEBUG, msg);
   }

   info(msg: string): void {
     this.log(LogLevel.INFO, msg);
   }

   warn(msg: string): void {
     this.log(LogLevel.WARN, msg);
   }

   error(msg: string): void {
     this.log(LogLevel.ERROR, msg);
   }

   private log(level: LogLevel, msg: string): void {
     const timestamp = new Date().toISOString();
     console.log(`[${timestamp}] ${level}: ${msg}`);
   }
 }

 export const logger = new Logger();
