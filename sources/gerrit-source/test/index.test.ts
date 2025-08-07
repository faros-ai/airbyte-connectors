import {AirbyteLogger, AirbyteLogLevel, SyncMode} from 'faros-airbyte-cdk';
import {sourceCheckTest, sourceReadTest} from 'faros-airbyte-testing-tools';
import fs from 'fs';
import {GerritSource} from '../src';
import {GerritClient} from '../src/gerrit';

describe('gerrit source', () => {
  const logger = new AirbyteLogger(AirbyteLogLevel.WARN);
  const source = new GerritSource(logger);

  const testConfig = JSON.parse(fs.readFileSync('test/test-config.json', 'utf8'));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toMatchSnapshot();
  });

  test('check connection - success', async () => {
    const checkConnection = jest.spyOn(GerritClient.prototype, 'checkConnection');
    checkConnection.mockResolvedValue(undefined);

    await sourceCheckTest({
      source,
      configOrPath: testConfig,
    });

    expect(checkConnection).toHaveBeenCalledTimes(1);
  });

  test('check connection - failure', async () => {
    const checkConnection = jest.spyOn(GerritClient.prototype, 'checkConnection');
    checkConnection.mockRejectedValue(new Error('test error'));

    await sourceCheckTest({
      source,
      configOrPath: testConfig,
    });

    expect(checkConnection).toHaveBeenCalledTimes(1);
  });

  test('read records', async () => {
    const listProjects = jest.spyOn(GerritClient.prototype, 'listProjects');
    listProjects.mockImplementation(async function* () {
      yield [{id: 'my-project', name: 'my-project'}];
    });


    const listChanges = jest.spyOn(GerritClient.prototype, 'listChanges');
    listChanges.mockImplementation(async function* () {
      yield [
        {
          _number: 123,
          project: 'my-project',
          subject: 'My Change',
          owner: {_account_id: 1, name: 'Test User', email: 'test@gerrit.test', username: 'testuser'},
          id: 'my-project~123',
          branch: 'main',
          change_id: 'I123abc',
          status: 'NEW',
          created: '2023-01-01T00:00:00Z',
          updated: '2023-01-01T00:00:00Z',
          insertions: 10,
          deletions: 5,
        },
      ];
    });

    const catalog = {
      streams: [
        {stream: {name: 'faros_projects', json_schema: {}}, sync_mode: SyncMode.INCREMENTAL},
        {stream: {name: 'faros_changes', json_schema: {}}, sync_mode: SyncMode.INCREMENTAL},
      ],
    };

    await sourceReadTest({
      source,
      configOrPath: testConfig,
      catalogOrPath: catalog,
      checkRecordsData: (records) => {
        expect(records.length).toBe(2);
        expect(records).toEqual(
          expect.arrayContaining([
            expect.objectContaining({name: 'my-project'}),
            expect.objectContaining({subject: 'My Change'}),
          ])
        );
      },
    });

    expect(listProjects).toHaveBeenCalledTimes(1);
    expect(listChanges).toHaveBeenCalledTimes(1);
  });
});