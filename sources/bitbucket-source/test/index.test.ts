import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec
} from 'faros-airbyte-cdk';
import {
  customStreamsTest,
  readResourceAsJSON,
  readTestFileAsJSON,
  readTestResourceAsJSON,
  sourceReadTest,
  sourceSchemaTest
} from 'faros-airbyte-testing-tools';
import {VError} from 'verror';

import {Bitbucket} from '../src/bitbucket';
import * as sut from '../src/index';
import {CustomStreamNames} from '../src/streams/common';
import {setupBitbucketInstance} from './utils';

const bitbucketInstance = Bitbucket.instance;


describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.BitbucketSource(logger);

  beforeEach(() => {
    Bitbucket.instance = bitbucketInstance;
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection', async () => {
    Bitbucket.instance = jest.fn().mockImplementation(() => {
      return new Bitbucket(
        {workspaces: {getWorkspaces: jest.fn().mockResolvedValue({})}} as any,
        100,
        1,
        1,
        5,
        logger,
        new Set()
      );
    });

    await expect(
      source.checkConnection({
        username: 'username',
        password: 'password',
        workspaces: ['workspace'],
        cutoff_days: 90,
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - rejected', async () => {
    Bitbucket.instance = jest.fn().mockImplementation(() => {
      return new Bitbucket(
        {
          workspaces: {
            getWorkspaces: jest.fn().mockRejectedValue(new Error('some error')),
          },
        } as any,
        100,
        1,
        1,
        5,
        logger,
        new Set()
      );
    });
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError(
        'Please verify your credentials are correct. Error: some error'
      ),
    ]);
  });

  test('check connection - invalid credentials', async () => {
    await expect(source.checkConnection({} as any)).resolves.toStrictEqual([
      false,
      new VError(
        'Invalid authentication details. Please provide either only the ' +
          'Bitbucket access token or Bitbucket username and password'
      ),
    ]);
  });

  test('streams - json schema fields', () => {
    sourceSchemaTest(source, readTestResourceAsJSON('config.json'));
  });

  test('streams - repositories', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'repositories/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupBitbucketInstance(
          {
            repositories: getRepositoriesMockedImplementation(),
            workspaces: getWorkspacesMockedImplementation(),
          },
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - repositories with bucketing', async () => {
    const config = readTestResourceAsJSON('repositories/config-bucketing.json');
    await sourceReadTest({
      source,
      configOrPath: config,
      catalogOrPath: 'repositories/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupBitbucketInstance(
          {
            repositories: getRepositoriesMockedImplementation(),
            workspaces: getWorkspacesMockedImplementation(),
          },
          logger,
          new Set(),
          config
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - workspaces', async () => {
    await sourceReadTest({
      source: new sut.BitbucketSource(logger),
      configOrPath: 'config.json',
      catalogOrPath: 'workspaces/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupBitbucketInstance(
          {
            workspaces: {
              ...getWorkspacesMockedImplementation(),
              getWorkspace: jest.fn().mockResolvedValue({
                data: readTestResourceAsJSON('workspaces/workspace.json'),
              }),
            },
          },
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - commits', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'commits/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupBitbucketInstance(
          {
            repositories: {
              listCommits: jest.fn().mockResolvedValue({
                data: {
                  values: readTestResourceAsJSON('commits/commits.json'),
                },
              }),
              list: jest.fn().mockResolvedValue({
                data: {
                  values: readTestResourceAsJSON(
                    'repositories/repository.json'
                  ),
                },
              }),
            },
            workspaces: getSingleWorkspaceMockedImplementation(),
          },
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - workspace_users', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'workspace_users/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupBitbucketInstance(
          {
            workspaces: {
              getMembersForWorkspace: jest.fn().mockResolvedValue({
                data: {
                  values: readTestResourceAsJSON(
                    'workspace_users/workspace_users.json'
                  ),
                },
              }),
              getWorkspaces: jest.fn().mockResolvedValue({
                data: {
                  values: [readTestResourceAsJSON('workspaces/workspace.json')],
                },
              }),
            },
          },
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - tags', async () => {
    await sourceReadTest({
      source,
      configOrPath: 'config.json',
      catalogOrPath: 'tags/catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupBitbucketInstance(
          {
            repositories: {
              ...getRepositoriesMockedImplementation(),
              listTags: jest.fn().mockResolvedValue({
                data: {
                  values: readTestResourceAsJSON('tags/tags.json'),
                },
              }),
            },
            workspaces: getSingleWorkspaceMockedImplementation(),
          },
          logger
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - pull_requests_with_activities', async () => {
    const configPaths = [
      'pull_requests_with_activities/config_run_mode_minimum.json',
      'pull_requests_with_activities/config_run_mode_full.json',
    ];
    for (const configPath of configPaths) {
      await sourceReadTest({
        source,
        configOrPath: configPath,
        catalogOrPath: 'pull_requests_with_activities/catalog.json',
        onBeforeReadResultConsumer: () => {
          setupBitbucketInstance(
            {
              repositories: {
                list: jest.fn().mockResolvedValue({
                  data: {
                    values: readTestResourceAsJSON(
                      'repositories/repository.json'
                    ),
                  },
                }),
                listPullRequests: jest.fn().mockResolvedValue({
                  data: {
                    values: readTestResourceAsJSON(
                      'pull_requests_with_activities/pull_requests.json'
                    ),
                  },
                }),
                listPullRequestActivities: jest.fn().mockResolvedValue({
                  data: {
                    values: readTestResourceAsJSON(
                      'pull_requests_with_activities/activities.json'
                    ),
                  },
                }),
              },
              pullrequests: {
                getDiffStat: jest.fn().mockResolvedValue({
                  data: {
                    values: readTestResourceAsJSON(
                      'pull_requests_with_activities/diff_stat.json'
                    ),
                  },
                }),
              },
              workspaces: getWorkspacesMockedImplementation(),
            },
            logger
          );
        },
        checkRecordsData: (records) => {
          expect(records).toMatchSnapshot();
        },
      });
    }
  });

  test('onBeforeRead with run_mode Custom streams without filtering', async () => {
    await customStreamsTest(
      source,
      readTestResourceAsJSON('config.json'),
      CustomStreamNames
    );
  });

  test('onBeforeRead with run_mode Custom streams with filtering', async () => {
    await customStreamsTest(
      source,
      readTestResourceAsJSON('config.json'),
      CustomStreamNames,
      CustomStreamNames.slice(0, 3)
    );
  });

  test('pr merge commit sha resolution', async () => {
    await sourceReadTest({
      source,
      configOrPath:
        'pr_merge_commit_sha_resolution/config_run_mode_minimum.json',
      catalogOrPath: 'pr_merge_commit_sha_resolution/catalog.json',
      onBeforeReadResultConsumer: () => {
        setupBitbucketInstance(
          {
            repositories: {
              list: jest.fn().mockResolvedValue({
                data: {
                  values: readTestResourceAsJSON(
                    'repositories/repository.json'
                  ),
                },
              }),
              listPullRequests: jest.fn().mockResolvedValue({
                data: {
                  values: readTestResourceAsJSON(
                    'pr_merge_commit_sha_resolution/pull_requests.json'
                  ),
                },
              }),
              listCommits: jest.fn().mockResolvedValue({
                data: {
                  values: readTestResourceAsJSON(
                    'pr_merge_commit_sha_resolution/commits.json'
                  ),
                },
              }),
            },
            pullrequests: {
              getDiffStat: jest.fn().mockResolvedValue({
                data: {
                  values: readTestResourceAsJSON(
                    'pull_requests_with_activities/diff_stat.json'
                  ),
                },
              }),
            },
            workspaces: getWorkspacesMockedImplementation(),
          },
          logger,
          new Set(['pull_requests_with_activities', 'commits'])
        );
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });
});

function getWorkspacesMockedImplementation() {
  return {
    getWorkspaces: jest.fn().mockResolvedValue({
      data: {
        values: readTestResourceAsJSON('workspaces/workspaces.json'),
      },
    }),
  };
}

function getSingleWorkspaceMockedImplementation() {
  return {
    getWorkspaces: jest.fn().mockResolvedValue({
      data: {
        values: [readTestResourceAsJSON('workspaces/workspace.json')],
      },
    }),
  };
}

function getRepositoriesMockedImplementation() {
  return {
    list: jest.fn().mockResolvedValue({
      data: {
        values: readTestResourceAsJSON('repositories/repositories.json'),
      },
    }),
  };
}
