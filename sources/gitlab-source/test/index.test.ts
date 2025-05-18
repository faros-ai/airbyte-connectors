import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  sourceCheckTest,
  sourceSchemaTest,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {merge} from 'lodash';
import VError from 'verror';

import {GitLab} from '../src/gitlab';
import * as sut from '../src/index';
import {GroupFilter} from '../src/group-filter';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const source = new sut.GitLabSource(logger);

  afterEach(() => {
    jest.restoreAllMocks();
    (GitLab as any).gitlab = undefined;
    (GroupFilter as any)._instance = undefined;
  });

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  function checkConnectionMock() {
    jest.spyOn(GitLab.prototype, 'checkConnection').mockResolvedValue();
    jest
      .spyOn(GroupFilter.prototype, 'getGroups')
      .mockResolvedValue(['group-1']);
  }

  test('check connection - token valid', async () => {
    checkConnectionMock();
    await sourceCheckTest({
      source,
      configOrPath: 'check_connection/token_valid.json',
    });
  });

  test('streams - json schema fields', () => {
    const source = new sut.GitLabSource(logger);
    sourceSchemaTest(source, {
      authentication: {
        type: 'token',
        personal_access_token: 'test-token',
      },
    });
  });
});
