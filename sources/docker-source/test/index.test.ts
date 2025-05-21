import {
  readResourceAsJSON,
  readTestFileAsJSON,
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {Docker} from '../src/docker';
import * as sut from '../src/index';

const dockerInstance = Docker.instance;



describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    Docker.instance = dockerInstance;
  });

  test('spec', async () => {
    const source = new sut.DockerSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection', async () => {
    Docker.instance = jest.fn().mockImplementation(() => {
      return {
        ...new Docker(
          'registry-base',
          new Date(),
          100,
          5,
          {headers: {}},
          undefined
        ),
        checkConnection: jest.fn().mockResolvedValue({}),
      };
    });

    const source = new sut.DockerSource(logger);
    await expect(
      source.checkConnection({
        username: 'username',
        password: 'password',
        repositories: 'test',
        cutoffDays: 90,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - no repositories', async () => {
    Docker.instance = jest.fn().mockImplementation(() => {
      return {
        ...new Docker(
          'registry-base',
          new Date(),
          100,
          5,
          {headers: {}},
          undefined
        ),
        checkConnection: jest.fn().mockRejectedValue({}),
      };
    });
    const source = new sut.DockerSource(logger);
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError('Provide repositories'),
    ]);
  });

  test('check connection - incorrect variables', async () => {
    const source = new sut.DockerSource(logger);
    await expect(
      source.checkConnection({repositories: ['test']} as any)
    ).resolves.toStrictEqual([
      false,
      new VError(
        'Missing authentication information. Please provide a Docker username'
      ),
    ]);
  });

  test('streams - tags, use full_refresh sync mode', async () => {
    const fnTagsFunc = jest.fn();

    Docker.instance = jest.fn().mockImplementation(() => {
      return {
        ...new Docker(
          'registry-base',
          new Date(),
          100,
          5,
          {headers: {}},
          undefined
        ),
        getTags: fnTagsFunc.mockImplementation(async function () {
          return readTestFileAsJSON('tags.json');
        }),
      };
    });
    const source = new sut.DockerSource(logger);
    const streams = source.streams({repositories: ['test']} as any);

    const tagsStream = streams[0];

    const streamSlice = await tagsStream
      .streamSlices(SyncMode.FULL_REFRESH)
      .next();
    const tagsIter = tagsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      streamSlice.value
    );
    const tags = [];
    for await (const incident of tagsIter) {
      tags.push(incident);
    }

    expect(fnTagsFunc).toHaveBeenCalledTimes(1);
    expect(tags).toStrictEqual(readTestFileAsJSON('tags.json'));
  });
});
