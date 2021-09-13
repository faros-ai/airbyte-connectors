import pino, {DestinationStream, Level, Logger} from 'pino';
import stream from 'stream';

import {
  AirbyteLog,
  AirbyteLogLevel,
  AirbyteLogLevelOrder,
  AirbyteMessage,
  AirbyteMessageType,
} from './protocol';

export class AirbyteLogger {
  private level = AirbyteLogLevel.INFO;

  constructor(level?: AirbyteLogLevel) {
    if (level) {
      this.level = level;
    } else if (
      process.env.LOG_LEVEL &&
      AirbyteLogLevel[process.env.LOG_LEVEL.toUpperCase()]
    ) {
      this.level = AirbyteLogLevel[process.env.LOG_LEVEL.toUpperCase()];
    }
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
    AirbyteLogger.writeMessage(msg, this.level);
  }

  /**
   * Creates a Pino Logger writing messages in Airbyte format
   *
   * @param level logging level
   * @returns Pino Logger
   */
  asPino(level: Level = 'info'): Logger {
    const defaultLevel = AirbyteLogLevel[level.toUpperCase()];

    const destination: DestinationStream = new stream.Writable({
      write: function (chunk, encoding, next): void {
        const msg = JSON.parse(chunk);
        const lvl: AirbyteLogLevel = msg.level
          ? AirbyteLogLevel[pino.levels.labels[msg.level].toUpperCase()]
          : defaultLevel;
        AirbyteLogger.writeMessage(AirbyteLog.make(lvl, msg.msg), defaultLevel);
        next();
      },
    });

    const logger = pino({level}, destination);
    return logger;
  }

  private static writeMessage(
    msg: AirbyteMessage,
    level: AirbyteLogLevel
  ): void {
    if (msg.type === AirbyteMessageType.LOG) {
      const levelOrder = AirbyteLogLevelOrder(level);
      const msgLevelOrder = AirbyteLogLevelOrder((msg as AirbyteLog).log.level);
      if (levelOrder > msgLevelOrder) return;
    }
    console.log(JSON.stringify(msg));
  }
}
