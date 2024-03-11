import pQueue from '@esm2cjs/p-queue';
import crypto from 'crypto';
import {
  AirbyteLog,
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteLogLevelOrder,
  AirbyteMessage,
  AirbyteSourceLog,
  isAirbyteLog,
  shouldWriteLog,
} from 'faros-airbyte-cdk';
import fs from 'fs';
import os from 'os';
import readline from 'readline';

export class LogFiles {
  private readonly srcPath: string;
  private readonly dstPath: string;

  private readonly srcStream: fs.WriteStream;
  private readonly dstStream: fs.WriteStream;

  private readonly srcWriteQueue: pQueue = new pQueue({concurrency: 1});
  private readonly dstWriteQueue: pQueue = new pQueue({concurrency: 1});

  constructor(private readonly logger: FarosDestinationLogger) {
    const logDir = os.tmpdir();
    this.srcPath = `${logDir}/src.log`;
    this.dstPath = `${logDir}/dst.log`;
    this.srcStream = fs.createWriteStream(this.srcPath, {flags: 'a'});
    this.dstStream = fs.createWriteStream(this.dstPath, {flags: 'a'});
  }

  writeSourceLogs(...logs: AirbyteSourceLog[]): void {
    this.srcWriteQueue.add(() => this.writeLogs(this.srcStream, logs));
  }

  writeDestinationLogs(...logs: AirbyteSourceLog[]): void {
    this.dstWriteQueue.add(() => this.writeLogs(this.dstStream, logs));
  }

  private logError(msg: string, error: any): void {
    this.logger.localWrite(
      AirbyteLog.make(AirbyteLogLevel.WARN, `${msg}: ${JSON.stringify(error)}`)
    );
  }

  private writeLogs(
    stream: fs.WriteStream,
    logs: AirbyteSourceLog[]
  ): Promise<void> | void {
    try {
      if (stream.closed || !logs.length) {
        return;
      }
      const logString =
        logs.map((log) => JSON.stringify(log)).join('\n') + '\n';
      if (!stream.write(logString)) {
        // If the stream returns false, wait for the drain event before continuing
        return new Promise((resolve) => {
          // Update maxListeners to suppress nodejs warning
          stream.setMaxListeners(stream.getMaxListeners() + 1);
          stream.once('drain', () => {
            stream.setMaxListeners(Math.max(stream.getMaxListeners() - 1, 0));
            resolve();
          });
        });
      }
    } catch (error) {
      this.logError('Failed to save logs to disk', error);
    }
  }

  async sortedLogs(
    logger?: AirbyteLogger
  ): Promise<{content: string; hash: string} | undefined> {
    try {
      await Promise.all([
        this.srcWriteQueue.onIdle(),
        this.dstWriteQueue.onIdle(),
      ]);

      this.srcStream.end();
      this.dstStream.end();

      await Promise.all([
        new Promise((resolve) => this.srcStream.once('close', resolve)),
        new Promise((resolve) => this.dstStream.once('close', resolve)),
      ]);

      const srcLogs: AirbyteSourceLog[] = [];
      const dstLogs: AirbyteSourceLog[] = [];

      logger?.debug('Gathering sync logs for uploading to Faros');
      await Promise.all([
        readFile(this.srcPath, (line) => srcLogs.push(JSON.parse(line))),
        readFile(this.dstPath, (line) => dstLogs.push(JSON.parse(line))),
      ]);
      const allLogs = srcLogs.concat(dstLogs);
      allLogs.sort((a, b) => a.timestamp - b.timestamp);
      const content = allLogs.map((log) => JSON.stringify(log)).join('\n');
      const hash = crypto.createHash('md5').update(content).digest('base64');
      logger?.debug('Finished gathering sync logs');
      return {content, hash};
    } catch (error) {
      this.logError('Failed to gather logs for uploading to Faros', error);
      return undefined;
    }
  }
}

async function readFile(
  filePath: string,
  processLine: (line: string) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => processLine(line));
    rl.on('close', () => resolve());
    fileStream.on('error', (error) => reject(error));
  });
}

export class FarosDestinationLogger extends AirbyteLogger {
  private pendingLogs: AirbyteSourceLog[] = [];
  private _logFiles: LogFiles;

  // Default to true to ensure initial logs are saved until destination can
  // determine if it should upload logs to Faros
  private _shouldSaveLogs: boolean = true;

  constructor(level?: AirbyteLogLevel) {
    super(level);
  }

  set logFiles(logFiles: LogFiles) {
    this._logFiles = logFiles;
    if (this._logFiles && this._shouldSaveLogs) {
      this._logFiles.writeDestinationLogs(...this.pendingLogs);
      this.pendingLogs.length = 0;
    }
  }

  set shouldSaveLogs(shouldSaveLogs: boolean) {
    this._shouldSaveLogs = shouldSaveLogs;
    if (!shouldSaveLogs) {
      this.pendingLogs.length = 0;
    }
  }

  localWrite(msg: AirbyteMessage): void {
    super.write(msg);
  }

  override write(msg: AirbyteMessage): void {
    super.write(msg);

    if (
      this._shouldSaveLogs &&
      isAirbyteLog(msg) &&
      shouldWriteLog(msg, this.level)
    ) {
      const syncLog: AirbyteSourceLog = {
        timestamp: Date.now(),
        message: {
          level: AirbyteLogLevelOrder(msg.log.level),
          msg: msg.log.message,
        },
      };

      if (this._logFiles) {
        this._logFiles.writeDestinationLogs(syncLog);
      } else {
        this.pendingLogs.push(syncLog);
      }
    }
  }
}
