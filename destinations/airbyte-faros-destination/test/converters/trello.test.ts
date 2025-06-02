import {AirbyteRecord} from 'faros-airbyte-cdk';
import {generateBasicTestSuite} from 'faros-airbyte-testing-tools';

import {Boards} from '../../src/converters/trello/boards';
import {Users} from '../../src/converters/trello/users';

generateBasicTestSuite({sourceName: 'trello'});

describe('trello', () => {
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
