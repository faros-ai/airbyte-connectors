import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, AirbyteLogLevel, AirbyteSpec} from 'faros-airbyte-cdk';
import fs from 'fs-extra';

import * as sut from '../src/index';
import {Vanta} from '../src/vanta';

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

function readResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
}

jest.mock('axios');

function returnResourceByQuery(queryBody: any) {
  const query = queryBody.query;
  if (query.includes('GithubDependabotVulnerabilityList')) {
    return readTestResourceFile('github_response_page.json');
  } else if (query.includes('AwsContainerVulnerabilityList')) {
    return readTestResourceFile('aws_response_page.json');
  } else if (query.includes('AwsContainerVulnerabilityV2List')) {
    return readTestResourceFile('aws_response_v2_page.json');
  } else {
    throw new Error('Unknown query');
  }
}

const mockAxiosInstance: Partial<AxiosInstance> = {
  post: jest.fn((url, queryBody) => returnResourceByQuery(queryBody)),
};

axios.create = jest.fn(() => mockAxiosInstance as AxiosInstance);

function unpackResourceDataByQueryName(queryName: string, data: any) {
  const edges = data['data']['data']['organization'][queryName]['edges'];
  return edges.map((edge: any) => edge.node);
}

function getAxiosInstance(cfg) {
  const timeout = cfg.timeout ?? 60000;
  const headers = {
    'content-type': 'application/json',
    Authorization: `token ${cfg.token}`,
    Accept: '*/*',
  };
  const api = axios.create({
    timeout, // default is `0` (no timeout)
    maxContentLength: Infinity, //default is 2000 bytes,
    maxBodyLength: Infinity, //default is 2000 bytes,
    headers,
  });
  return api;
}

function getVantaInstance(logger, cfg, limit): Vanta {
  const axios_instance = getAxiosInstance(cfg);
  return new Vanta(logger, axios_instance, limit, cfg.apiUrl, true);
}

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const sampleConfig = readTestResourceFile('sample_cfg.json');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    const source = new sut.VantaSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('git single page', async () => {
    const vanta = getVantaInstance(logger, sampleConfig, 100);
    // const query = readTestResourceFile('query_single_page.json');
    const queryType = 'git';
    const output = [];
    const res = await vanta.vulns(queryType);
    for await (const item of res) {
      output.push(item);
    }

    console.log(`test output: ${output}`);
    const preExpected = readTestResourceFile('github_response_page.json');
    const expected = unpackResourceDataByQueryName(
      'GithubDependabotVulnerabilityList',
      preExpected
    );
    await expect(output).toStrictEqual(expected);
  });

  test('test all query types single page', async () => {
    const vanta = getVantaInstance(logger, sampleConfig, 100);
    // const query = readTestResourceFile('query_single_page.json');
    const queryTypes = ['git', 'aws', 'awsv2'];
    const output = [];
    for (const queryType of queryTypes) {
      const res = await vanta.vulns(queryType);
      for await (const item of res) {
        output.push(item);
      }
    }
    console.log(`test output: ${output}`);
    const totalExpected = [];
    const preExpected = readTestResourceFile('github_response_page.json');
    const expected = unpackResourceDataByQueryName(
      'GithubDependabotVulnerabilityList',
      preExpected
    );
    totalExpected.push(...expected);
    const preExpected2 = readTestResourceFile('aws_response_page.json');
    const expected2 = unpackResourceDataByQueryName(
      'AwsContainerVulnerabilityList',
      preExpected2
    );
    totalExpected.push(...expected2);
    const preExpected3 = readTestResourceFile('aws_response_v2_page.json');
    const expected3 = unpackResourceDataByQueryName(
      'AwsContainerVulnerabilityV2List',
      preExpected3
    );
    totalExpected.push(...expected3);
    await expect(output).toStrictEqual(totalExpected);
  });
});
