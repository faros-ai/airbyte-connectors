import {AirbyteRecord} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal} from 'mockttp';

import {Boards} from '../../src/converters/trello/boards';
import {Users} from '../../src/converters/trello/users';
import {initMockttp, tempConfig} from '../testing-tools';
import {trelloAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('trello', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/trello/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__trello__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {
      boards: 1,
      users: 1,
    };
    const expectedWrittenByModel = {
      tms_Project: 1,
      tms_TaskBoard: 1,
      tms_TaskBoardProjectRelationship: 1,
      tms_User: 1,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: trelloAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
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
