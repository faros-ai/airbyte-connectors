import pino, {DestinationStream, Level, Logger} from 'pino';
import stream from 'stream';

import {AirbyteLog, AirbyteLogLevel, AirbyteMessage} from './protocol';

export class AirbyteLogger {
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
    AirbyteLogger.writeMessage(msg);
  }

  /**
   * Creates a Pino Logger writing messages in Airbyte format
   *
   * @param level logging level
   * @returns Pino Logger
   */
  asPino(level: Level = 'info'): Logger {
    const detaultLevel = AirbyteLogLevel[level.toUpperCase()];

    const destination: DestinationStream = new stream.Writable({
      write: function (chunk, encoding, next): void {
        const msg = JSON.parse(chunk);
        const lvl = msg.level
          ? AirbyteLogLevel[pino.levels.labels[msg.level].toUpperCase()]
          : detaultLevel;
        AirbyteLogger.writeMessage(AirbyteLog.make(lvl, msg.msg));
        next();
      },
    });

    const logger = pino({level}, destination);

    return logger;
  }

  private static writeMessage(msg: AirbyteMessage): void {
    console.log(JSON.stringify(msg));
  }
}
