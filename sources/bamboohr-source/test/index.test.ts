import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {readResourceFile} from 'faros-airbyte-common/common';
import fs from 'fs-extra';
import {VError} from 'verror';

import {BambooHR} from '../src/bamboohr';
import * as sut from '../src/index';

const bambooHRInstance = BambooHR.instance;

jest.mock('axios');

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    BambooHR.instance = bambooHRInstance;
  });



  function readTestResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
  }

  const fieldsResource: any[] = readTestResourceFile('fields_input.json');
  const usersResource: any = readTestResourceFile('users_input.json');
  const userDetailsResource: any[] = readTestResourceFile(
    'user_details_input.json'
  );

  test('spec', async () => {
    const source = new sut.BambooHRSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection - no client_secret', async () => {
    const source = new sut.BambooHRSource(logger);
    await expect(
      source.checkConnection({
        api_key: '',
        domain: '',
      } as any)
    ).resolves.toStrictEqual([false, new VError('api_key cannot be empty')]);
  });

  test('streams - users, fail when field alias not found', async () => {
    const fnUsersFunc = jest.fn();

    BambooHR.instance = jest.fn().mockImplementation(() => {
      return new BambooHR(
        {
          get: fnUsersFunc.mockResolvedValueOnce({data: fieldsResource}),
        } as any,
        null
      );
    });
    const source = new sut.BambooHRSource(logger);
    const streams = source.streams({
      additional_fields: ['Bad Field Name'],
    } as any);

    const usersStream = streams[0];
    const userIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    await expect(userIter.next()).rejects.toStrictEqual(
      new VError(
        'Could not find field alias for additional field Bad Field Name'
      )
    );
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersFunc = jest.fn();

    BambooHR.instance = jest.fn().mockImplementation(() => {
      return new BambooHR(
        {
          get: fnUsersFunc
            .mockResolvedValueOnce({data: fieldsResource})
            .mockResolvedValueOnce({data: usersResource})
            .mockResolvedValueOnce({data: userDetailsResource, status: 200}),
        } as any,
        logger
      );
    });
    const source = new sut.BambooHRSource(logger);
    const streams = source.streams({
      additional_fields: ['customShirtsize'],
    } as any);

    const usersStream = streams[0];
    const userIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of userIter) {
      users.push(user);
    }

    expect(fnUsersFunc).toHaveBeenCalledTimes(3);
    expect(users).toStrictEqual([userDetailsResource]);
  });

  test('streams - users, filter by department', async () => {
    const fnUsersFunc = jest.fn();

    BambooHR.instance = jest.fn().mockImplementation(() => {
      return new BambooHR(
        {
          get: fnUsersFunc
            .mockResolvedValueOnce({
              data: {...usersResource, '1': usersResource['0']},
            })
            .mockResolvedValueOnce({data: userDetailsResource, status: 200})
            .mockResolvedValueOnce({
              data: {
                ...userDetailsResource,
                department: 'department-to-ignore',
              },
              status: 200,
            }),
        } as any,
        logger
      );
    });
    const source = new sut.BambooHRSource(logger);
    const streams = source.streams({
      departments: ['test'],
    } as any);

    const usersStream = streams[0];
    const userIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of userIter) {
      users.push(user);
    }

    expect(fnUsersFunc).toHaveBeenCalledTimes(3);
    expect(users).toStrictEqual([userDetailsResource]);
  });
});
