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
  sourceSchemaTest,
} from 'faros-airbyte-testing-tools';

import {GoogleDrive} from '../src/googledrive';
import * as sut from '../src/index';

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.GoogleDriveSource(logger);

  afterEach(() => {
    jest.restoreAllMocks();
    (GoogleDrive as any).googleDrive = undefined;
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection', async () => {
    setupGoogleDriveInstance({}, {users: []}, {});

    await sourceCheckTest({
      source,
      configOrPath: 'config.json',
    });
  });

  test('streams - json schema fields', () => {
    sourceSchemaTest(source, readTestResourceAsJSON('config.json'));
  });

  test('streams - activity', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'activity/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGoogleDriveInstance(
          readTestResourceAsJSON('activity/activities.json'),
          readTestResourceAsJSON('workspace_users/users.json')
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - workspace users', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'workspace_users/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGoogleDriveInstance(
          {},
          readTestResourceAsJSON('workspace_users/users.json')
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - workspace', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'workspace/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupGoogleDriveInstance(
          {},
          {users: []},
          readTestResourceAsJSON('workspace/customer.json')
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });
});

function setupGoogleDriveInstance(
  activityMock: any = {},
  usersMock: any = {},
  customerMock: any = {}
) {
  const mockCredentials = {
    client_email: 'test@test-project.iam.gserviceaccount.com',
    private_key: 'mock-private-key',
  };

  jest
    .spyOn(GoogleDrive, 'instance')
    .mockImplementation(async (config, logger) => {
      const mockAuth = {
        getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
      };

      const adminDirectoryClient = {
        users: {
          list: jest.fn().mockResolvedValue({
            data: usersMock,
          }),
        },
        customers: {
          get: jest.fn().mockResolvedValue({
            data: customerMock,
          }),
        },
      };

      const driveActivityClient = {
        activity: {
          query: jest.fn().mockResolvedValue({
            data: activityMock,
          }),
        },
      };

      return new GoogleDrive(
        mockCredentials,
        mockAuth as any,
        adminDirectoryClient as any,
        driveActivityClient as any,
        logger
      );
    });
}

const getActivityMockedImplementation = (activitiesResponse: any) =>
  activitiesResponse;

const getWorkspaceUsersMockedImplementation = (usersResponse: any) =>
  usersResponse;

const getWorkspaceCustomerMockedImplementation = (customer: any) => customer;
