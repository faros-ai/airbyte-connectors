import _ from 'lodash';
import {getLocal} from 'mockttp';

import {AirbyteLogger, AirbyteRecord} from '../../../../faros-airbyte-cdk/lib';
import {StreamContext} from '../../src';
import {Boards} from '../../src/converters/trello/boards';
import {Users} from '../../src/converters/trello/users';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {trelloAllStreamsLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('trello', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/trello/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__trello__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url);
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(trelloAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      boards: 1,
      users: 1,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      tms_Project: 1,
      tms_TaskBoard: 1,
      tms_TaskBoardProjectRelationship: 1,
      tms_User: 1,
    };

    await assertProcessedAndWrittenModels(
      processedByStream,
      writtenByModel,
      stdout,
      processed,
      cli
    );
  });

  describe('boards', () => {
    const converter = new Boards();
    const BOARD = {
      id: 'b98e01d14cf778006ae8e8d1',
      name: 'Innovative Venture',
    };

    test('basic board', async () => {
      const record = AirbyteRecord.make('boards', BOARD);
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });
  });

  describe('users', () => {
    const converter = new Users();
    const USER = {
      id: '1735be8ade395c72d43d6603',
      fullName: 'Jamie Williams',
      username: 'jwilliams80',
    };

    test('basic user', async () => {
      const record = AirbyteRecord.make('mytestsource__trello__users', USER);
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });
  });
});
