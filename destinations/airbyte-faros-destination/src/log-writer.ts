import crypto from 'crypto';
import {AirbyteSourceLog} from 'faros-airbyte-cdk';
import fs from 'fs';
import os from 'os';
import readline from 'readline';

export class LogWriter {
  private readonly sourceLogPath: string;
  private readonly destLogPath: string;

  private readonly sourceLogStream: fs.WriteStream;
  private readonly destLogStream: fs.WriteStream;

  constructor() {
    const logDir = os.tmpdir();
    this.sourceLogPath = `${logDir}/source.log`;
    this.destLogPath = `${logDir}/dest.log`;
    this.sourceLogStream = fs.createWriteStream(this.sourceLogPath, {
      flags: 'a',
    });
    this.destLogStream = fs.createWriteStream(this.destLogPath, {flags: 'a'});
  }

  async writeSourceLog(sourceLog: AirbyteSourceLog): Promise<void> {
    await writeDataHandlingBackpressure(
      this.sourceLogStream,
      JSON.stringify(sourceLog) + '\n'
    );
  }

  async writeDestLog(sourceLog: AirbyteSourceLog): Promise<void> {
    await writeDataHandlingBackpressure(
      this.destLogStream,
      JSON.stringify(sourceLog) + '\n'
    );
  }

  async sortedLogs(): Promise<{content: string; hash: string}> {
    this.sourceLogStream.end();
    this.destLogStream.end();

    const sourceLogs: AirbyteSourceLog[] = [];
    const destLogs: AirbyteSourceLog[] = [];

    await Promise.all([
      readFileLineByLine(this.sourceLogPath, (line) => {
        sourceLogs.push(JSON.parse(line));
      }),
      readFileLineByLine(this.destLogPath, (line) => {
        destLogs.push(JSON.parse(line));
      }),
    ]);

    const sortedLogs = sourceLogs.concat(destLogs).sort((a, b) => {
      return a.timestamp - b.timestamp;
    });
    const content = sortedLogs.map((log) => JSON.stringify(log)).join('\n');
    const hash = crypto.createHash('md5').update(content).digest('base64');
    return {content, hash};
  }
}

async function readFileLineByLine(
  filePath: string,
  processLine: (line: string) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      processLine(line);
    });

    rl.on('close', () => {
      console.log('Finished reading the file.');
      resolve(); // Resolve the promise when file reading is complete
    });

    fileStream.on('error', (error) => {
      console.error(
        `An error occurred while reading the file: ${error.message}`
      );
      reject(error); // Reject the promise if an error occurs
    });
  });
}

async function writeDataHandlingBackpressure(
  stream: fs.WriteStream,
  data: any
): Promise<void> {
  if (!stream.write(data)) {
    // If the stream returns false, wait for the drain event before continuing
    await waitForDrain(stream);
  }
}

function waitForDrain(stream: fs.WriteStream): Promise<void> {
  return new Promise((resolve) => {
    stream.once('drain', resolve);
  });
}
