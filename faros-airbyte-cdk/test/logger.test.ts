import {Writable} from 'stream';

import {AirbyteLogger, AirbyteRecord, parseAirbyteMessage} from '../src';

function captureConsoleLog(callback: () => void): string {
  const chunks: string[] = [];
  const writableStream = new Writable({
    write(chunk, encoding, next) {
      chunks.push(chunk.toString());
      next();
    },
  });

  const originalLog = console.log;
  console.log = (...args: any[]) => {
    writableStream.write(args.join(' ') + '\n');
  };

  callback();

  console.log = originalLog;
  return chunks.join('');
}

describe('logger', () => {
  const logger = new AirbyteLogger();

  test('converts undefined record fields to nulls', async () => {
    const data = {
      boolean: true,
      number: 1,
      string: 'string',
      array: [1, 'string', {a: 1}],
      object: {a: 1, b: 'string'},
      null: null,
      undefined: undefined,
      objectWithUndefined: {a: 1, null: null, undefined: undefined},
    };
    const expectedData = {
      ...data,
      undefined: null,
      objectWithUndefined: {a: 1, null: null, undefined: null},
    };

    const consoleOutput = captureConsoleLog(() =>
      logger.write(
        new AirbyteRecord({
          stream: 'test',
          emitted_at: 1,
          data,
        })
      )
    );

    const outputRecord = parseAirbyteMessage(consoleOutput) as AirbyteRecord;
    expect(outputRecord.record.data).toEqual(expectedData);
  });
});
