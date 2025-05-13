import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {GoogleDriveActivity} from '../src/googledriveactivity';
import * as sut from '../src/index';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}


describe('index', () => {
  const logger = new AirbyteSourceLogger(
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    const source = new sut.GoogleDriveActivitySource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    GoogleDriveActivity.instance = jest.fn().mockImplementation(() => {
      return new GoogleDriveActivity(
        {
          activity: {
            query: jest.fn().mockResolvedValue({
              data: {activities: []},
            }),
          },
        } as any,
        'test@example.com',
        90,
        logger
      );
    });

    const source = new sut.GoogleDriveActivitySource(logger);
    await expect(
      source.checkConnection({
        private_key: 'key',
        client_email: 'email',
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect config', async () => {
    GoogleDriveActivity.instance = jest.fn().mockImplementation(() => {
      return new GoogleDriveActivity(
        {
          activity: {
            query: jest.fn().mockRejectedValue('some error'),
          },
        } as any,
        'test@example.com',
        90,
        logger
      );
    });
    
    const source = new sut.GoogleDriveActivitySource(logger);
    await expect(
      source.checkConnection({
        private_key: 'key',
        client_email: 'email',
      })
    ).resolves.toStrictEqual([
      false,
      new VError(
        'Please verify your private_key and client_email are correct and have access to Drive Activity API. ' +
          'Error: err must be an Error'
      ),
    ]);
  });

  test('streams - activity, use full_refresh sync mode', async () => {
    const activityQuery = jest.fn();

    GoogleDriveActivity.instance = jest.fn().mockImplementation(() => {
      return new GoogleDriveActivity(
        {
          activity: {
            query: activityQuery.mockResolvedValue({
              data: {
                activities: [
                  {
                    timestamp: {time: '2023-01-01T00:00:00Z'},
                    actors: [{user: {knownUser: {personName: 'users/123', isCurrentUser: true}}}],
                    targets: [{driveItem: {name: 'items/123', title: 'Test File'}}],
                    actions: [{detail: {edit: {}}}],
                  },
                ],
              },
            }),
          },
        } as any,
        'test@example.com',
        90,
        logger
      );
    });
    
    const source = new sut.GoogleDriveActivitySource(logger);
    const streams = source.streams({
      private_key: 'key',
      client_email: 'email',
    });

    const activityStream = streams[0];
    const activityIter = activityStream.readRecords(SyncMode.FULL_REFRESH);
    const activities = [];
    for await (const activity of activityIter) {
      activities.push(activity);
    }
    
    expect(activityQuery).toHaveBeenCalledTimes(1);
    expect(activities).toHaveLength(1);
    expect(activities[0].timestamp.time).toBe('2023-01-01T00:00:00Z');
  });

  test('streams - activity, use incremental sync mode', async () => {
    const activityQuery = jest.fn();

    GoogleDriveActivity.instance = jest.fn().mockImplementation(() => {
      return new GoogleDriveActivity(
        {
          activity: {
            query: activityQuery.mockResolvedValue({
              data: {
                activities: [
                  {
                    timestamp: {time: '2023-01-02T00:00:00Z'},
                    actors: [{user: {knownUser: {personName: 'users/123', isCurrentUser: true}}}],
                    targets: [{driveItem: {name: 'items/123', title: 'Test File'}}],
                    actions: [{detail: {edit: {}}}],
                  },
                ],
              },
            }),
          },
        } as any,
        'test@example.com',
        90,
        logger
      );
    });
    
    const source = new sut.GoogleDriveActivitySource(logger);
    const streams = source.streams({
      private_key: 'key',
      client_email: 'email',
    });

    const activityStream = streams[0];
    const activityIter = activityStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      undefined,
      {
        primaryTime: '2023-01-01T00:00:00Z',
      }
    );
    
    const activities = [];
    for await (const activity of activityIter) {
      activities.push(activity);
    }
    
    expect(activityQuery).toHaveBeenCalledTimes(1);
    expect(activities).toHaveLength(1);
    
    const newState = activityStream.getUpdatedState(
      {primaryTime: '2023-01-01T00:00:00Z'},
      activities[0]
    );
    expect(newState.primaryTime).toBe('2023-01-02T00:00:00Z');
  });
});
