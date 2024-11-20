import {Dictionary} from 'ts-essentials';

import {AirbyteLogger} from '../../../src/logger';
import {
  AirbyteStreamBase,
  calculateUpdatedStreamState,
  StreamKey,
} from '../../../src/sources/streams/stream-base';

const logger = new AirbyteLogger();
class TestStream extends AirbyteStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return {};
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(): AsyncGenerator<Dictionary<any>> {}
}

describe('AirbyteStreamBase', () => {
  it('should return snake-cased name', () => {
    expect(new TestStream(logger).name).toBe('test_stream');
  });

  describe('wrappedPrimaryKey', () => {
    const wpk = AirbyteStreamBase.wrappedPrimaryKey;

    it('should wrap a single-field primary key', () => {
      expect(wpk('id')).toEqual([['id']]);
    });

    it('should wrap a composite primary key', () => {
      expect(wpk(['name', 'id'])).toEqual([['name'], ['id']]);
    });

    it('should wrap a primary key with a single nested-field', () => {
      expect(wpk([['profile', 'id']])).toEqual([['profile', 'id']]);
    });

    it('should wrap a primary key with multiple nested-fields', () => {
      expect(
        wpk([
          ['profile', 'id'],
          ['profile', 'name'],
        ])
      ).toEqual([
        ['profile', 'id'],
        ['profile', 'name'],
      ]);
    });

    it('should wrap a primary key with single and nested fields', () => {
      expect(wpk([['profile', 'id'], ['profile', 'name'], ['hash']])).toEqual([
        ['profile', 'id'],
        ['profile', 'name'],
        ['hash'],
      ]);
    });
  });

  describe('asAirbyeStream', () => {
    const stream = new TestStream(logger);

    it('should generate a stream json for a non-incremental stream', () => {
      expect(stream.asAirbyteStream()).toEqual({
        name: 'test_stream',
        json_schema: {},
        supported_sync_modes: ['full_refresh'],
        source_defined_primary_key: [['id']],
      });
    });

    it('should generate a stream json for an incremental stream', () => {
      jest.spyOn(stream, 'cursorField', 'get').mockReturnValue('updated_at');
      expect(stream.asAirbyteStream()).toEqual({
        name: 'test_stream',
        json_schema: {},
        supported_sync_modes: ['full_refresh', 'incremental'],
        source_defined_primary_key: [['id']],
        source_defined_cursor: true,
        default_cursor_field: ['updated_at'],
      });
    });
  });
});

describe('calculateUpdatedStreamState', () => {
  describe('github use case', () => {
    it('should return currentStreamState if latestRecordCutoff is null', () => {
      const currentStreamState = {'github/repo1': {cutoff: 1627641720000}};
      const result = calculateUpdatedStreamState(
        null,
        currentStreamState,
        'github/repo1'
      );
      expect(result).toEqual(currentStreamState);
    });

    it('should return currentStreamState if latestRecordCutoff is not greater than currentCutoff', () => {
      const currentStreamState = {
        'github/repo1': {cutoff: new Date('2021-07-30T00:00:00Z').getTime()},
      };
      const latestRecordCutoff = new Date('2021-07-29T00:00:00Z');
      const result = calculateUpdatedStreamState(
        latestRecordCutoff,
        currentStreamState,
        'github/repo1'
      );
      expect(result).toEqual(currentStreamState);
    });

    it('should return updated stream state if latestRecordCutoff is greater than currentCutoff', () => {
      const currentStreamState = {
        'github/repo1': {cutoff: new Date('2021-07-30T00:00:00Z').getTime()},
      };
      const latestRecordCutoff = new Date('2021-08-30T00:00:00Z');
      const result = calculateUpdatedStreamState(
        latestRecordCutoff,
        currentStreamState,
        'github/repo1'
      );
      const expectedState = {
        'github/repo1': {cutoff: new Date('2021-08-30T00:00:00Z').getTime()},
      };
      expect(result).toEqual(expectedState);
    });
  });

  describe('jira use case', () => {
    it('should return currentStreamState if latestRecordCutoff is null', () => {
      const currentStreamState = {project1: {cutoff: 1627641720000}};
      const result = calculateUpdatedStreamState(
        null,
        currentStreamState,
        'project1',
        0
      );
      expect(result).toEqual(currentStreamState);
    });

    it('should return currentStreamState if adjustedLatestRecordCutoff is not greater than currentCutoff', () => {
      const currentStreamState = {
        project1: {cutoff: new Date('2021-07-30T00:00:00Z').getTime()},
      };
      const latestRecordCutoff = new Date('2021-08-01T00:00:00Z');
      const result = calculateUpdatedStreamState(
        latestRecordCutoff,
        currentStreamState,
        'project1',
        7
      );
      expect(result).toEqual(currentStreamState);
    });

    it('should return updated stream state if adjustedLatestRecordCutoff is greater than currentCutoff', () => {
      const currentStreamState = {
        project1: {cutoff: new Date('2021-07-30T00:00:00Z').getTime()},
      };
      const latestRecordCutoff = new Date('2021-08-30T00:00:00Z');
      const result = calculateUpdatedStreamState(
        latestRecordCutoff,
        currentStreamState,
        'project1',
        7
      );
      const expectedState = {
        project1: {cutoff: new Date('2021-08-23T00:00:00Z').getTime()},
      };
      expect(result).toEqual(expectedState);
    });
  });
});
