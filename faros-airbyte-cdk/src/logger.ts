import {isNil} from 'lodash';
import pino, {DestinationStream, Level, Logger} from 'pino';
import stream from 'stream';
import {Dictionary} from 'ts-essentials';

import {
  AirbyteLog,
  AirbyteLogLevel,
  AirbyteLogLevelOrder,
  AirbyteMessage,
  AirbyteMessageType,
  AirbyteRecord,
  AirbyteTrace,
  AirbyteTraceFailureType,
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

  error(message: string, stack_trace?: string): void {
    this.write(AirbyteLog.make(AirbyteLogLevel.ERROR, message, stack_trace));
  }

  warn(message: string, stack_trace?: string): void {
    this.write(AirbyteLog.make(AirbyteLogLevel.WARN, message, stack_trace));
  }

  info(message: string, stack_trace?: string): void {
    this.write(AirbyteLog.make(AirbyteLogLevel.INFO, message, stack_trace));
  }

  debug(message: string, stack_trace?: string): void {
    this.write(AirbyteLog.make(AirbyteLogLevel.DEBUG, message, stack_trace));
  }

  trace(message: string, stack_trace?: string): void {
    this.write(AirbyteLog.make(AirbyteLogLevel.TRACE, message, stack_trace));
  }

  traceError(error: any, failure_type?: AirbyteTraceFailureType): void {
    this.write(AirbyteTrace.make(error, failure_type));
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

    console.log(
      JSON.stringify(
        msg.type === AirbyteMessageType.RECORD
          ? prepareAirbyteRecord(msg as AirbyteRecord)
          : msg
      )
    );
  }
}

function prepareAirbyteRecord(record: AirbyteRecord): AirbyteRecord {
  return new AirbyteRecord({
    stream: record.record.stream,
    namespace: record.record.namespace,
    emitted_at: record.record.emitted_at,
    data: replaceUndefinedWithNull(record.record.data),
  });
}

// convert undefined record values to nulls so they are stringified
function replaceUndefinedWithNull(obj: Dictionary<any>): Dictionary<any> {
  const result: Dictionary<any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      result[key] = replaceUndefinedWithNull(value);
    } else {
      result[key] = value === undefined ? null : value;
    }
  }

  return result;
}
