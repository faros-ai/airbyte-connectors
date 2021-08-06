import {AirbyteLog, AirbyteLogLevel, AirbyteMessage} from './protocol';

export class AirbyteLogger {
  fatal(message: string): void {
    this.log(AirbyteLogLevel.FATAL, message);
  }

  error(message: string): void {
    this.log(AirbyteLogLevel.ERROR, message);
  }

  warn(message: string): void {
    this.log(AirbyteLogLevel.WARN, message);
  }

  info(message: string): void {
    this.log(AirbyteLogLevel.INFO, message);
  }

  debug(message: string): void {
    this.log(AirbyteLogLevel.DEBUG, message);
  }

  trace(message: string): void {
    this.log(AirbyteLogLevel.TRACE, message);
  }

  private log(level: AirbyteLogLevel, message: string): void {
    this.write(AirbyteLog.make(level, message));
  }

  write(msg: AirbyteMessage): void {
    console.log(JSON.stringify(msg));
  }
}
