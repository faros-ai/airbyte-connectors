import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON,
  readTestResourceAsJSON,
  sourceCheckTest,
  sourceReadTest,
} from 'faros-airbyte-testing-tools';
import {FarosClient} from 'faros-js-client';
import VError from 'verror';

import * as sut from '../src/index';
import {TeamMembershipHistory} from '../src/streams';

interface TeamMembershipModel {
  readonly team: {uid: string} | null;
  readonly member: {uid: string} | null;
  readonly startedAt?: string;
}

interface MockGraphQueries {
  readonly currentMemberships?: TeamMembershipModel[];
  readonly previousMemberships?: TeamMembershipModel[];
}

function mockGraphQueries(mock: MockGraphQueries): void {
  jest
    .spyOn(FarosClient.prototype, 'nodeIterable')
    .mockImplementation((_graph, query) => {
      if (query.includes('CurrentTeamMemberships')) {
        return mockAsyncIterable(mock.currentMemberships ?? []);
      } else if (query.includes('PreviousTeamMemberships')) {
        return mockAsyncIterable(mock.previousMemberships ?? []);
      }
      return mockAsyncIterable([]);
    });
}

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.TeamHistorySource(logger);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  describe('check connection', () => {
    test('valid', async () => {
      jest.spyOn(FarosClient.prototype, 'graphExists').mockResolvedValue(true);

      await sourceCheckTest({
        source,
        configOrPath: 'check_connection/valid_config.json',
      });
    });

    test('missing graph', async () => {
      await sourceCheckTest({
        source,
        configOrPath: 'check_connection/missing_graph.json',
      });
    });

    test('graph does not exist', async () => {
      jest.spyOn(FarosClient.prototype, 'graphExists').mockResolvedValue(false);

      await sourceCheckTest({
        source,
        configOrPath: 'check_connection/valid_config.json',
      });
    });

    test('api error', async () => {
      jest
        .spyOn(FarosClient.prototype, 'graphExists')
        .mockRejectedValue(new VError('API connection failed'));

      await sourceCheckTest({
        source,
        configOrPath: 'check_connection/valid_config.json',
      });
    });
  });

  test('streams', () => {
    const config = readTestResourceAsJSON('valid_config.json');
    const streams = source.streams(config);

    expect(streams).toHaveLength(1);
    expect(streams[0]).toBeInstanceOf(TeamMembershipHistory);
  });

  describe('TeamMembershipHistory stream', () => {
    test('schema', () => {
      const config = readTestResourceAsJSON('valid_config.json');
      const farosClient = new FarosClient({
        url: config.api_url,
        apiKey: config.api_key,
      });
      const stream = new TeamMembershipHistory(
        farosClient,
        config.graph,
        logger
      );
      const schema = stream.getJsonSchema();
      expect(schema).toMatchSnapshot();
    });

    test('primary key', () => {
      const config = readTestResourceAsJSON('valid_config.json');
      const farosClient = new FarosClient({
        url: config.api_url,
        apiKey: config.api_key,
      });
      const stream = new TeamMembershipHistory(
        farosClient,
        config.graph,
        logger
      );
      expect(stream.primaryKey).toEqual(['teamUid', 'memberUid', 'startedAt']);
    });

    test('readRecords - new memberships', async () => {
      mockGraphQueries({
        currentMemberships: [
          {team: {uid: 'team1'}, member: {uid: 'user1'}},
          {team: {uid: 'team2'}, member: {uid: 'user1'}},
          {team: {uid: 'team1'}, member: {uid: 'user2'}},
        ],
        previousMemberships: [
          {
            team: {uid: 'team1'},
            member: {uid: 'user1'},
            startedAt: '2023-01-01T00:00:00Z',
          },
        ],
      });

      await sourceReadTest({
        source,
        configOrPath: 'valid_config.json',
        catalogOrPath: 'catalog.json',
        checkRecordsData: (records) => {
          expect(records).toHaveLength(2);
          expect(records).toContainEqual(
            expect.objectContaining({
              teamUid: 'team2',
              memberUid: 'user1',
              startedAt: expect.any(Date),
            })
          );

          expect(records).toContainEqual(
            expect.objectContaining({
              teamUid: 'team1',
              memberUid: 'user2',
              startedAt: expect.any(Date),
            })
          );
        },
      });
    });

    test('readRecords - updated memberships', async () => {
      mockGraphQueries({
        currentMemberships: [{team: {uid: 'team1'}, member: {uid: 'user1'}}],
        previousMemberships: [
          {
            team: {uid: 'team1'},
            member: {uid: 'user1'},
            startedAt: '2023-01-01T00:00:00Z',
          },
          {
            team: {uid: 'team2'},
            member: {uid: 'user1'},
            startedAt: '2023-02-01T00:00:00Z',
          },
        ],
      });

      await sourceReadTest({
        source,
        configOrPath: 'valid_config.json',
        catalogOrPath: 'catalog.json',
        checkRecordsData: (records) => {
          expect(records).toHaveLength(1);
          expect(records).toContainEqual(
            expect.objectContaining({
              memberUid: 'user1',
              teamUid: 'team2',
              startedAt: new Date('2023-02-01T00:00:00Z'),
              endedAt: expect.any(Date),
            })
          );
        },
      });
    });

    test('readRecords - no changes', async () => {
      mockGraphQueries({
        currentMemberships: [{team: {uid: 'team1'}, member: {uid: 'user1'}}],
        previousMemberships: [
          {
            team: {uid: 'team1'},
            member: {uid: 'user1'},
            startedAt: '2023-01-01T00:00:00Z',
          },
        ],
      });

      await sourceReadTest({
        source,
        configOrPath: 'valid_config.json',
        catalogOrPath: 'catalog.json',
        checkRecordsData: (records) => {
          expect(records).toHaveLength(0);
        },
      });
    });

    test('readRecords - ignore records with nulls', async () => {
      mockGraphQueries({
        currentMemberships: [
          {team: {uid: 'team1'}, member: {uid: 'user1'}},
          {team: null, member: {uid: 'user2'}}, // Missing team
          {team: {uid: 'team2'}, member: null}, // Missing member
          {team: {uid: null}, member: {uid: 'user3'}}, // Missing team uid
          {team: {uid: 'team3'}, member: {uid: null}}, // Missing member uid
        ],
        previousMemberships: [
          {
            team: {uid: 'team1'},
            member: {uid: 'user1'},
            startedAt: '2023-01-01T00:00:00Z',
          },
          {team: {uid: 'team4'}, member: {uid: 'user4'}, startedAt: null}, // Missing startedAt
        ],
      });

      await sourceReadTest({
        source,
        configOrPath: 'valid_config.json',
        catalogOrPath: 'catalog.json',
        checkRecordsData: (records) => {
          expect(records).toHaveLength(0);
        },
      });
    });
  });
});

// Helper function to create async iterable from array
async function* mockAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}
