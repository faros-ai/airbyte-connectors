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
    const date = new Date();
    const data = {
      boolean: true,
      number: 1,
      string: 'string',
      array: [1, 'string', {a: 1}],
      date: date,
      keyWithNullValue: null,
      keyWithUndefinedValue: undefined,
      object: {
        boolean: true,
        number: 1,
        string: 'string',
        array: [1, 'string', {a: 1}],
        object: {a: 1},
        date: date,
        keyWithNullValue: null,
        keyWithUndefinedValue: undefined,
      },
    };
    const expectedData = {
      ...data,
      date: date.toISOString(),
      keyWithUndefinedValue: null,
      object: {
        ...data.object,
        date: date.toISOString(),
        keyWithUndefinedValue: null,
      },
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
    expect(outputRecord).toEqual(
      new AirbyteRecord({stream: 'test', emitted_at: 1, data: expectedData})
    );

    const namespacedOutputRecord = parseAirbyteMessage(
      captureConsoleLog(() =>
        logger.write(
          new AirbyteRecord({
            stream: 'test',
            namespace: 'test_namespace',
            emitted_at: 1,
            data,
          })
        )
      )
    ) as AirbyteRecord;
    expect(namespacedOutputRecord).toEqual(
      new AirbyteRecord({
        stream: 'test',
        namespace: 'test_namespace',
        emitted_at: 1,
        data: expectedData,
      })
    );
  });
});
