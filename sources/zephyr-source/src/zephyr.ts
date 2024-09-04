import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry, wrapApiError} from 'faros-js-client';
import {values} from 'lodash';
import VError from 'verror';

import {ZephyrConfig} from './types';

const ZEPHYR_CLOUD_BASE_URL = 'https://api.zephyrscale.smartbear.com/v2';
const ZEPHYR_API_DEFAULT_TIMEOUT = 0;
const ZEPHYR_PAGE_LIMIT = 100;

// TODO - Add proper types for all the get methods
// TODO - Add generic pagination logic if possible
export class Zephyr {
  private static zephyr: Zephyr;
  constructor(
    private readonly api: AxiosInstance,
    private readonly limit: number,
    private readonly logger?: AirbyteLogger
  ) {}

  static async instance(
    config: ZephyrConfig,
    logger?: AirbyteLogger
  ): Promise<Zephyr> {
    if (Zephyr.zephyr) return Zephyr.zephyr;

    if (!config.access_token) {
      throw new VError(
        'Please provide Zephyr Scale Cloud authentication details, ' +
          'Client Id and a Client Secret'
      );
    }

    // TODO - Add rate limiting logic if any
    const api = makeAxiosInstanceWithRetry(
      {
        baseURL: ZEPHYR_CLOUD_BASE_URL,
        timeout: config.api_timeout ?? ZEPHYR_API_DEFAULT_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.access_token}`,
        },
        maxContentLength: Infinity, //default is 2000 bytes
      },
      logger?.asPino(),
      config.api_max_retries
    );

    const limit = config.api_page_limit
      ? Math.min(config.api_page_limit, ZEPHYR_PAGE_LIMIT)
      : ZEPHYR_PAGE_LIMIT;

    Zephyr.zephyr = new Zephyr(api, limit, logger);
    return Zephyr.zephyr;
  }

  async checkConnection(): Promise<void> {
    await this.api.get('/healthcheck');
  }

  async getTestCases(projectKey?: string): Promise<ReadonlyArray<any>> {
    const plans: any[] = [];
    // TODO - Add real api call and return the response
    // Example
    // const response = await this.api.get('/testcases', {params: {projectKey}});
    // const values = response.data?.values;
    // for (const plan of values) {
    //   plans.push({
    //     id: plan.id,
    //     key: plan.key,
    //     name: plan.name,
    //     // Add more fields as needed
    //   });
    // }
    plans.push({
      id: 1,
      key: 'key',
      name: 'name',
    });
    return plans;
  }

  async getTestCycles(projectKey?: string): Promise<ReadonlyArray<any>> {
    const cycles: any[] = [];
    cycles.push({
      id: 1,
      key: 'key',
      name: 'name',
    });
    return cycles;
  }

  async getTestExecutions(projectKey?: string): Promise<ReadonlyArray<any>> {
    const testExecutions: any[] = [];
    testExecutions.push({
      id: 1,
      key: 'key',
      name: 'name',
    });
    return testExecutions;
  }
}
