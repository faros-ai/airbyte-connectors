import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Vanta} from '../src/vanta';

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

function getVantaInstance(logger, axios_instance, limit, apiUrl): Vanta {
  return new Vanta(logger, axios_instance, limit, apiUrl, true);
}

jest.mock('axios', () => {
  return {
    AxiosInstance: jest.fn().mockImplementation(() => {
      return {
        async post(apiUrl: string, queryBody: any): Promise<any[]> {
          if (queryBody.query.includes('GithubDependabotVulnerabilityList')) {
            return readTestResourceFile('github_response_page.json');
          } else if (
            queryBody.query.includes('AwsContainerVulnerabilityList')
          ) {
            return readTestResourceFile('aws_response_page.json');
          } else if (
            queryBody.query.includes('AwsContainerVulnerabilityV2List')
          ) {
            return readTestResourceFile('aws_response_v2_page.json');
          }
        },
      };
    }),
  };
});

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const config_tkn = readTestResourceFile('config_tokens.json');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.skip('spec', async () => {
    const source = new sut.VantaSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });
  test('git single page', async () => {
    const vanta = getVantaInstance(
      logger,
      config_tkn.axios_instance,
      100,
      config_tkn.apiUrl
    );
    // const query = readTestResourceFile('query_single_page.json');
    const expected = readTestResourceFile('github_response_page.json');
    const queryType = 'git';
    const res = await vanta.vulns(queryType);
    console.log(`test res: ${res}`);
    await expect(res).resolves.toStrictEqual(expected);
  });
});
