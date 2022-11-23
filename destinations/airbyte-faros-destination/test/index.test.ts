import {
  AirbyteConfig,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
} from 'faros-airbyte-cdk';
import {Schema} from 'faros-feeds-sdk/lib';
import fs from 'fs-extra';
import {getLocal} from 'mockttp';
import os from 'os';

import {Edition, FarosDestinationRunner, InvalidRecordStrategy} from '../src';
import {
  batchIterator,
  GraphQLBackend,
  GraphQLClient,
  mergeByPrimaryKey,
  serialize,
  strictPick,
  toLevels,
  Upsert,
  UpsertBuffer,
} from '../src/common/graphql-client';
import {FarosDestination} from '../src/destination';
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

describe('graphql-client write batch upsert', () => {
  const schemaLoader = {
    async loadSchema(): Promise<Schema> {
      return await fs.readJson('test/resources/hasura-schema.json', {
        encoding: 'utf-8',
      });
    },
  };
  test('basic end-to-end', async () => {
    const res1 = JSON.parse(`
    {
      "data": {
      "insert_vcs_Organization": {
        "returning": [
          {
            "id": "t1|gql-e2e-v2|GitHub|faros-ai",
            "uid": "faros-ai",
            "source": "GitHub"
            }
          ]
        }
      }
    }`);
    const res2 = JSON.parse(`
    {
      "data": {
        "insert_vcs_Repository": {
          "returning": [
            {
              "id": "t1|gql-e2e-v2|metis|t1|gql-e2e-v2|GitHub|faros-ai",
              "name": "metis",
              "organizationId": "t1|gql-e2e-v2|GitHub|faros-ai"
            },
            {
              "id": "t1|gql-e2e-v2|hermes|t1|gql-e2e-v2|GitHub|faros-ai",
              "name": "hermes",
              "organizationId": "t1|gql-e2e-v2|GitHub|faros-ai"
            }
          ]
        }
      }
    }`);
    const res3 = JSON.parse(`
    {
      "data": {
        "insert_vcs_Branch": {
          "returning": [
            {
              "id": "t1|gql-e2e-v2|foo|t1|gql-e2e-v2|metis|t1|gql-e2e-v2|GitHub|faros-ai",
              "name": "foo",
              "repositoryId": "t1|gql-e2e-v2|metis|t1|gql-e2e-v2|GitHub|faros-ai"
            },
            {
              "id": "t1|gql-e2e-v2|main|t1|gql-e2e-v2|hermes|t1|gql-e2e-v2|GitHub|faros-ai",
              "name": "main",
              "repositoryId": "t1|gql-e2e-v2|hermes|t1|gql-e2e-v2|GitHub|faros-ai"
            }
          ]
        }
      }
    }`);
    const record1 = JSON.parse(
      '{"name":"foo","uid":"foo","repository":{"name":"metis","uid":"metis","organization":{"uid":"faros-ai","source":"GitHub"}},"source":"GitHub"}'
    );
    const record2 = JSON.parse(
      '{"name":"main","uid":"main","repository":{"name":"hermes","uid":"hermes","organization":{"uid":"faros-ai","source":"GitHub"}},"source":"GitHub"}'
    );
    let queries = 0;
    const backend: GraphQLBackend = {
      healthCheck() {
        return Promise.resolve();
      },
      postQuery(query: any) {
        expect(query).toMatchSnapshot();
        queries++;
        if (query.startsWith('mutation { insert_vcs_Organization')) {
          return Promise.resolve(res1);
        } else if (query.startsWith('mutation { insert_vcs_Repository')) {
          return Promise.resolve(res2);
        } else if (query.startsWith('mutation { insert_vcs_Branch')) {
          return Promise.resolve(res3);
        } else {
          throw new Error('unexpected query ' + query);
        }
      },
    };
    const client = new GraphQLClient(
      new AirbyteLogger(AirbyteLogLevel.INFO),
      schemaLoader,
      backend,
      10
    );
    await client.loadSchema();
    await client.writeRecord('vcs_Branch', record1, 'mytestsource');
    await client.writeRecord('vcs_Branch', record2, 'mytestsource');
    await client.flush();
    expect(queries).toEqual(3);
  });
  test('record with null primary key field', async () => {
    const res1 = JSON.parse(`
    {
      "data": {
      "insert_vcs_Organization": {
        "returning": [
          {
            "id": "t1|gql-e2e-v2|GitHub|faros-ai",
            "uid": "faros-ai",
            "source": null
            }
          ]
        }
      }
    }`);
    // org without source (aka null primary key field)
    const record1 = JSON.parse('{"uid":"faros-ai"}');
    let queries = 0;
    const backend: GraphQLBackend = {
      healthCheck() {
        return Promise.resolve();
      },
      postQuery(query: any) {
        expect(query).toMatchSnapshot();
        queries++;
        if (query.startsWith('mutation { insert_vcs_Organization')) {
          return Promise.resolve(res1);
        } else {
          throw new Error('unexpected query ' + query);
        }
      },
    };
    const client = new GraphQLClient(
      new AirbyteLogger(AirbyteLogLevel.INFO),
      schemaLoader,
      backend,
      10
    );
    await client.loadSchema();
    await client.writeRecord('vcs_Organization', record1, 'mytestsource');
    await client.flush();
    expect(queries).toEqual(1);
  });
  test('mergeByPrimaryKey', async () => {
    const users = [
      {
        uid: 'tovbinm',
        name: 'tovbinm',
        htmlUrl: 'https://github.com/tovbinm',
        type: {category: 'User', detail: 'user'},
        source: 'GitHub',
        origin: 'mytestsource',
      },
      {uid: 'tovbinm', source: 'GitHub', origin: 'mytestsource2'},
      {
        uid: 'vitalyg',
        name: 'vitalyg',
        htmlUrl: 'https://github.com/vitalyg',
        type: {category: 'User', detail: 'user'},
        source: 'GitHub',
        origin: 'mytestsource',
      },
      {
        uid: 'vitalyg',
        source: 'GitHub',
        origin: 'mytestsource',
        type: {foo: 'bar'},
      },
    ];
    const primaryKeys = ['uid', 'source'];
    expect(mergeByPrimaryKey(users, primaryKeys)).toMatchSnapshot();
  });
  test('self-referent model', async () => {
    const responses = [
      // #1
      JSON.parse(`  
      {
        "data": {
          "insert_org_Employee": {
            "returning": [
              {
                "id": "t1|gql-e2e-v2|7",
                "uid": "7"
              },
              {
                "id": "t1|gql-e2e-v2|9",
                "uid": "9"
              }
            ]
          }
        }
      }`),
      // #2
      JSON.parse(`
      {
        "data": {
          "insert_org_Employee": {
            "returning": [
              {
                "id": "t1|gql-e2e-v2|10",
                "uid": "10"
              },
              {
                "id": "t1|gql-e2e-v2|8",
                "uid": "8"
              },
              {
                "id": "t1|gql-e2e-v2|7",
                "uid": "7"
              }
            ]
          }
        }
      }`),
    ];
    const records = [
      JSON.parse('{"uid":"10","manager":{"uid":"7"},"source":"BambooHR"}'),
      JSON.parse('{"uid":"8","manager":{"uid":"9"},"source":"BambooHR"}'),
      JSON.parse('{"uid":"7","manager":{"uid":"9"},"source":"BambooHR"}'),
      JSON.parse('{"uid":"9","source":"BambooHR"}'),
    ];
    let queries = 0;
    const backend: GraphQLBackend = {
      healthCheck() {
        return Promise.resolve();
      },
      postQuery(query: any) {
        expect(query).toMatchSnapshot();
        return responses[queries++];
      },
    };
    const client = new GraphQLClient(
      new AirbyteLogger(AirbyteLogLevel.INFO),
      schemaLoader,
      backend,
      10
    );
    await client.loadSchema();
    for (const rec of records) {
      await client.writeRecord('org_Employee', rec, 'mytestsource');
    }
    await client.flush();
    expect(queries).toEqual(2);
  });
});

describe('upsert buffer', () => {
  test('basic', async () => {
    const buf = new UpsertBuffer();
    buf.add({model: 'm1', object: {}, foreignKeys: {}});
    expect(buf.size()).toEqual(1);
    expect(buf.pop('unknown')).toBeUndefined();
    buf.add({model: 'm2', object: {}, foreignKeys: {}});
    buf.add({model: 'm2', object: {}, foreignKeys: {}});
    expect(buf.size()).toEqual(2);
    expect(buf.pop('m2')?.length).toEqual(2);
    expect(buf.size()).toEqual(1);
    expect(buf.get('m1')?.length).toEqual(1);
    expect(buf.size()).toEqual(1);
    expect(buf.pop('m1')?.length).toEqual(1);
    expect(buf.size()).toEqual(0);
  });
});

describe('graphql-client utilities', () => {
  test('serialize', async () => {
    expect(serialize({z: 1, a: 'bar'})).toEqual('a:bar|z:1');
    expect(serialize({})).toEqual('');
  });
  test('strictPick', async () => {
    expect(strictPick({z: 1, a: 'bar'}, ['z', 'b'])).toEqual({z: 1, b: 'null'});
    expect(strictPick({z: 1, a: 'bar'}, ['b'])).toEqual({b: 'null'});
  });
});

describe('toLevels', () => {
  async function expectLevels(upserts: Upsert[]): Promise<void> {
    const iterator = batchIterator(toLevels(upserts), (batch) => {
      return Promise.resolve(batch.map((u) => u.id).sort());
    });
    const res = [];
    for await (const result of iterator) {
      res.push(result);
    }
    expect(res).toMatchSnapshot();
  }

  test('simple chain', async () => {
    const u0: Upsert = {
      id: 'u0',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u1: Upsert = {
      id: 'u1',
      model: 'm',
      object: {},
      foreignKeys: {
        r: u0,
      },
    };
    const u2: Upsert = {
      id: 'u2',
      model: 'm',
      object: {},
      foreignKeys: {
        r: u1,
      },
    };
    await expectLevels([u2]);
    await expectLevels([u1]);
    await expectLevels([u0]);
  });
  test('simple tree', async () => {
    const u0: Upsert = {
      id: 'u0',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u1: Upsert = {
      id: 'u1',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u2: Upsert = {
      id: 'u2',
      model: 'm',
      object: {},
      foreignKeys: {
        l: u0,
        r: u1,
      },
    };
    await expectLevels([u2]);
  });
  test('imbalanced tree', async () => {
    const u0: Upsert = {
      id: 'u0',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u3: Upsert = {
      id: 'u3',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u1: Upsert = {
      id: 'u1',
      model: 'm',
      object: {},
      foreignKeys: {
        r: u3,
      },
    };
    const u2: Upsert = {
      id: 'u2',
      model: 'm',
      object: {},
      foreignKeys: {
        l: u0,
        r: u1,
      },
    };
    await expectLevels([u2]);
  });
  test('ignore other models', async () => {
    const u0: Upsert = {
      id: 'u0',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u3: Upsert = {
      id: 'u3',
      model: 'm',
      object: {},
      foreignKeys: {},
    };
    const u1: Upsert = {
      id: 'u1',
      model: 'm2', // different model type
      object: {},
      foreignKeys: {
        r: u3,
      },
    };
    const u2: Upsert = {
      id: 'u2',
      model: 'm',
      object: {},
      foreignKeys: {
        l: u0,
        r: u1,
      },
    };
    await expectLevels([u2]);
  });
});
