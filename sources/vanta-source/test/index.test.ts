import axios, {AxiosInstance} from 'axios';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec
} from 'faros-airbyte-cdk';
import {
  sourceCheckTest,
  sourceReadTest,
  sourceSchemaTest,
  readResourceAsJSON,
  readTestResourceAsJSON
} from 'faros-airbyte-testing-tools';

import * as sut from '../src/index';
import {Vanta} from '../src/vanta';

jest.mock('axios');

function getResponseByPath(url: any): any {
  if (url.includes('vulnerabilities')) {
    return readTestResourceAsJSON('vulnerabilities_response.json');
  }
  if (url.includes('vulnerability-remediations')) {
    return readTestResourceAsJSON('vulnerability_remediations_response.json');
  }
  if (url.includes('vulnerable-assets')) {
    return readTestResourceAsJSON('vulnerable_assets_response.json');
  }
}

function getAxiosInstance(): AxiosInstance {
  const headers = {
    'content-type': 'application/json',
    Accept: '*/*',
  };
  return axios.create({
    timeout: 60000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers,
  });
}

function setupVantaInstance(logger: AirbyteLogger): void {
  const mockAxiosInstance: Partial<AxiosInstance> = {
    get: jest.fn((url) => Promise.resolve(getResponseByPath(url))),
  };
  axios.create = jest.fn(() => mockAxiosInstance as AxiosInstance);
  const axios_instance = getAxiosInstance();
  Vanta.instance = jest.fn().mockImplementation(() => {
    return new Vanta(axios_instance, 10, logger);
  });
}

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const sampleConfig = readTestResourceAsJSON('sample_cfg.json');
  const source = new sut.VantaSource(logger);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    const source = new sut.VantaSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection - invalid - missing credentials', async () => {
    await sourceCheckTest({
      source,
      configOrPath: {},
    });
  });

  test('streams - json schema fields', () => {
    sourceSchemaTest(source, sampleConfig);
  });

  test('streams - vulnerabilities', async () => {
    await sourceReadTest({
      source,
      configOrPath: sampleConfig,
      catalogOrPath: 'vulnerabilities_catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupVantaInstance(logger);
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });

  test('streams - vulnerability remediations', async () => {
    await sourceReadTest({
      source,
      configOrPath: sampleConfig,
      catalogOrPath: 'vulnerability_remediations_catalog.json',
      onBeforeReadResultConsumer: (res) => {
        setupVantaInstance(logger);
      },
      checkRecordsData: (records) => {
        expect(records).toMatchSnapshot();
      },
    });
  });
});
