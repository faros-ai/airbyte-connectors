import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import VError from 'verror';

import * as sut from '../src/index';
import {Trello, TrelloConfig} from '../src/trello';

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.TrelloSource(logger);

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - invalid', async () => {
    await expect(
      source.checkConnection({} as TrelloConfig)
    ).resolves.toStrictEqual([
      false,
      new VError('Please provide a Trello API key.'),
    ]);
    await expect(
      source.checkConnection({credentials: {key: 'k'}} as TrelloConfig)
    ).resolves.toStrictEqual([
      false,
      new VError('Please provide a Trello API token.'),
    ]);
  });

  test('check connection', async () => {
    Trello.instance = jest.fn().mockImplementation(() => {
      return new Trello(
        {
          get: jest
            .fn()
            .mockResolvedValue({data: [{id: 'b1', name: 'board1'}]}),
        } as any,
        '2021-01-01',
        '2021-01-02',
        ['b1'],
        100
      );
    });

    await expect(source.checkConnection(config)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  const config: TrelloConfig = {credentials: {key: 'k', token: 't'}};

  const testStream = async (streamIndex, expectedData) => {
    const fnList = jest.fn();

    Trello.instance = jest.fn().mockImplementation(() => {
      return new Trello(
        {
          get: fnList.mockResolvedValueOnce(expectedData),
        } as any,
        '2021-01-01',
        '2021-01-02',
        ['b1'],
        100
      );
    });

    const source = new sut.TrelloSource(logger);
    const streams = source.streams(config);
    const stream = streams[streamIndex];
    const iter = stream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      board: 'b1',
    });

    const items = [];
    for await (const item of iter) {
      items.push(item);
    }

    expect(fnList).toHaveBeenCalledTimes(1);
    expect(items).toStrictEqual(expectedData.data);
  };

  test('streams - boards', async () => {
    const expectedBoards = {
      data: [{id: 'b1', name: 'board1'}],
    };
    await testStream(1, expectedBoards);
  });
});

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}
