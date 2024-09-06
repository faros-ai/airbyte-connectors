import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, base64Encode} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry, wrapApiError} from 'faros-js-client';
import {values} from 'lodash';
import {Dictionary} from 'ts-essentials';
import VError from 'verror';

import {AccessToken, Authentication, UserPassword, ZephyrConfig} from './types';

const ZEPHYR_CLOUD_BASE_URL = 'https://api.zephyrscale.smartbear.com/v2';
const ZEPHYR_API_DEFAULT_TIMEOUT = 0;
// TODO - Resolve for Server vs Cloud
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

    // TODO - Add rate limiting logic if any
    const api = makeAxiosInstanceWithRetry(
      {
        baseURL: config.url ?? ZEPHYR_CLOUD_BASE_URL,
        timeout: config.api_timeout ?? ZEPHYR_API_DEFAULT_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
          Authorization: Zephyr.auth(config),
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

  private static auth(config: ZephyrConfig): string {
    const authentication = config.authentication;
    const tokenAuth = authentication as AccessToken;
    if (!config.url || config.url === ZEPHYR_CLOUD_BASE_URL) {
      if (!tokenAuth.token) {
        throw new VError('Please provide Zephyr Scale Cloud access token');
      }
      return `Bearer ${tokenAuth.token}`;
    }
    if (tokenAuth.token !== undefined) {
      return `Bearer ${tokenAuth.token}`;
    }

    const userAuth = authentication as UserPassword;
    if (userAuth.username && userAuth.password) {
      return `Basic ${base64Encode(`${userAuth.username}:${userAuth.password}`)}`;
    }

    throw new VError(
      'Either Zephyr Scale personal token or Jira username and password ' +
        'must be provided for Zephyr Scale Server'
    );
  }

  async checkConnection(): Promise<void> {
    await this.api.get('/healthcheck');
  }

  private async *iterate<V>(
    endpoint: string,
    params: Dictionary<any>
  ): AsyncIterableIterator<V> {
    let startAt = 0;
    let isLast = false;
    do {
      const config = {params: {...params, maxResults: this.limit, startAt}};
      const response = await this.api.get(endpoint, config);
      const data = response.data;
      for (const item of data?.values ?? []) {
        yield item;
      }
      isLast = data.isLast;
      startAt = startAt + data.maxResults;
    } while (!isLast);
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
