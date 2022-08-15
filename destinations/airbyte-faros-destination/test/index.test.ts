import {
  AirbyteConfig,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteLogger,
  AirbyteSpec,
  withDefaults,
} from 'faros-airbyte-cdk';
import {getLocal} from 'mockttp';
import os from 'os';

import {FarosDestinationRunner} from '../src';
import {GraphQLClient} from '../src/common/graphql-client';
import {
  Edition,
  FarosDestination,
  InvalidRecordStrategy,
} from '../src/destination';
import {CLI, read} from './cli';
import {initMockttp, tempConfig} from './testing-tools';

describe('index', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url);
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('help', async () => {
    const cli = await CLI.runWith(['--help']);
    expect(await read(cli.stderr)).toBe('');
    expect(await read(cli.stdout)).toMatch(/^Usage: main*/);
    expect(await cli.wait()).toBe(0);
  });

  test('spec', async () => {
    const cli = await CLI.runWith(['spec']);
    expect(await read(cli.stderr)).toBe('');
    expect(await read(cli.stdout)).toBe(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      JSON.stringify(new AirbyteSpec(require('../resources/spec.json'))) +
        os.EOL
    );
    expect(await cli.wait()).toBe(0);
  });

  test('check', async () => {
    const cli = await CLI.runWith(['check', '--config', configPath]);

    expect(await read(cli.stderr)).toBe('');
    expect(await read(cli.stdout)).toBe(
      JSON.stringify(
        new AirbyteConnectionStatusMessage({
          status: AirbyteConnectionStatus.SUCCEEDED,
        })
      ) + os.EOL
    );
    expect(await cli.wait()).toBe(0);
  });

  test('check community edition config', async () => {
    const configPath = await tempConfig(
      mockttp.url,
      InvalidRecordStrategy.SKIP,
      Edition.COMMUNITY
    );
    const cli = await CLI.runWith(['check', '--config', configPath]);

    expect(await read(cli.stderr)).toBe('');
    expect(await read(cli.stdout)).toBe(
      JSON.stringify(
        new AirbyteConnectionStatusMessage({
          status: AirbyteConnectionStatus.SUCCEEDED,
        })
      ) + os.EOL
    );
    expect(await cli.wait()).toBe(0);
  });

  test('fail check on invalid segment user id', async () => {
    const configPath = await tempConfig(
      mockttp.url,
      InvalidRecordStrategy.SKIP,
      Edition.COMMUNITY,
      {segment_user_id: 'badid'}
    );
    const cli = await CLI.runWith(['check', '--config', configPath]);

    expect(await read(cli.stderr)).toBe('');
    expect(await read(cli.stdout)).toContain(
      'Segment User Id badid is not a valid UUID.'
    );
    expect(await cli.wait()).toBe(0);
  });

  test('check for circular converter dependencies', async () => {
    const dest = new FarosDestination(new AirbyteLogger());
    expect(() =>
      dest.checkForCircularDependencies({
        s1: new Set(['s2', 's3', 's4']),
        s2: new Set('s3'),
        s3: new Set('s0'),
      })
    ).not.toThrow();
    expect(() =>
      dest.checkForCircularDependencies({
        s1: new Set(['s1']),
      })
    ).toThrow(/s1,s1/);
    expect(() =>
      dest.checkForCircularDependencies({
        s1: new Set(['s2']),
        s2: new Set(['s1']),
      })
    ).toThrow(/s1,s2,s1/);
    expect(() =>
      dest.checkForCircularDependencies({
        s1: new Set(['s2', 's4']),
        s2: new Set(['s0']),
        s3: new Set(['s0', 's1']),
        s4: new Set(['s3']),
      })
    ).toThrow(/s1,s4,s3,s1/);
  });

  test('allow overriding spec', async () => {
    const dest = new FarosDestinationRunner(
      new AirbyteSpec({
        documentationUrl: 'test',
        connectionSpecification: {foo: 'bar'},
      })
    );
    const main = dest.mainCommand().exitOverride();
    const res = await main
      .parseAsync(['node', 'main', 'spec'])
      .catch((e) => fail(e));
    expect(res.opts()).toEqual({});
  });

  test('allow adding config check', async () => {
    const dest = new FarosDestinationRunner(
      new AirbyteSpec({
        documentationUrl: 'test',
        connectionSpecification: {foo: 'bar'},
      })
    );
    let config: AirbyteConfig = undefined;
    dest.onConfigCheck(async (cfg: AirbyteConfig) => {
      config = cfg;
    });
    const main = dest.mainCommand().exitOverride();
    const res = await main
      .parseAsync(['node', 'main', 'check', '--config', configPath])
      .catch((e) => fail(e));
    expect(res.opts()).toEqual({});
    expect(config).toBeDefined();
  });
});

describe('graphql-client', () => {
  test('basic batch mutation', async () => {
    const json: any = [
      {
        mutation: {
          insert_vcs_Membership_one: {
            __args: {
              object: {
                vcs_User: {
                  data: {uid: 'ashnet16', source: 'GitHub', origin: 'myghsrc'},
                  on_conflict: {
                    constraint: {value: 'vcs_User_pkey'},
                    update_columns: [{value: 'refreshedAt'}],
                  },
                },
                vcs_Organization: {
                  data: {uid: 'faros-ai', source: 'GitHub', origin: 'myghsrc'},
                  on_conflict: {
                    constraint: {value: 'vcs_Organization_pkey'},
                    update_columns: [{value: 'refreshedAt'}],
                  },
                },
                origin: 'myghsrc',
              },
              on_conflict: {
                constraint: {value: 'vcs_Membership_pkey'},
                update_columns: [{value: 'origin'}, {value: 'refreshedAt'}],
              },
            },
            id: true,
          },
        },
      },
      {
        mutation: {
          insert_vcs_User_one: {
            __args: {
              object: {
                uid: 'betafood',
                type: {category: 'User', detail: 'user'},
                source: 'GitHub',
                origin: 'myghsrc',
              },
              on_conflict: {
                constraint: {value: 'vcs_User_pkey'},
                update_columns: [
                  {value: 'email'},
                  {value: 'name'},
                  {value: 'origin'},
                  {value: 'refreshedAt'},
                  {value: 'type'},
                  {value: 'url'},
                ],
              },
            },
            id: true,
          },
        },
      },
    ];
    expect(GraphQLClient.batchMutation(json)).toMatchSnapshot();
  });
  test('empty batch mutation', async () => {
    expect(GraphQLClient.batchMutation([])).toBeUndefined();
  });
  test('no mutations', async () => {
    const json: any = [
      {
        query: {
          insert_vcs_Membership_one: {
            __args: {
              object: {
                vcs_User: {
                  data: {uid: 'ashnet16', source: 'GitHub', origin: 'myghsrc'},
                  on_conflict: {
                    constraint: {value: 'vcs_User_pkey'},
                    update_columns: [{value: 'refreshedAt'}],
                  },
                },
                vcs_Organization: {
                  data: {uid: 'faros-ai', source: 'GitHub', origin: 'myghsrc'},
                  on_conflict: {
                    constraint: {value: 'vcs_Organization_pkey'},
                    update_columns: [{value: 'refreshedAt'}],
                  },
                },
                origin: 'myghsrc',
              },
              on_conflict: {
                constraint: {value: 'vcs_Membership_pkey'},
                update_columns: [{value: 'origin'}, {value: 'refreshedAt'}],
              },
            },
            id: true,
          },
        },
      },
      {
        query: {
          insert_vcs_User_one: {
            __args: {
              object: {
                uid: 'betafood',
                type: {category: 'User', detail: 'user'},
                source: 'GitHub',
                origin: 'myghsrc',
              },
              on_conflict: {
                constraint: {value: 'vcs_User_pkey'},
                update_columns: [
                  {value: 'email'},
                  {value: 'name'},
                  {value: 'origin'},
                  {value: 'refreshedAt'},
                  {value: 'type'},
                  {value: 'url'},
                ],
              },
            },
            id: true,
          },
        },
      },
    ];
    expect(GraphQLClient.batchMutation(json)).toBeUndefined();
  });
});

describe('utils withDefaults', () => {
  const spec = new AirbyteSpec(require('../resources/spec.json'));
  const config: AirbyteConfig = {
    dry_run: false,
    jsonata_mode: 'FALLBACK',
    edition_configs: {
      edition: 'cloud',
      api_url: 'http://localhost:8081',
      api_key: 'Bearer k1',
      graph: 'ted',
      check_tenant: false,
    },
    invalid_record_strategy: 'SKIP',
  };

  test('prop with default and defined value', () => {
    const res = withDefaults(config, spec);
    expect(res.edition_configs.check_tenant).toBeDefined();
    expect(config.edition_configs.check_tenant).toStrictEqual(
      res.edition_configs.check_tenant
    );
  });

  test('prop without default and defined value', () => {
    const res = withDefaults(config, spec);
    expect(res.edition_configs.api_key).toBeDefined();
    expect(config.edition_configs.api_key).toStrictEqual(
      res.edition_configs.api_key
    );
  });

  test('prop without default and undefined value', () => {
    const res = withDefaults(config, spec);
    expect(res.origin).toBeUndefined();
    expect(config.edition_configs.origin).toBeUndefined();
  });

  test('prop  with default and undefined value', () => {
    const res = withDefaults(config, spec);
    expect(res.edition_configs.cloud_graphql_batch_size).toBeDefined();
    expect(config.edition_configs.cloud_graphql_batch_size).toBeUndefined();
  });
});
