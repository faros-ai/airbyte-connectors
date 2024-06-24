import axios, {AxiosError, AxiosInstance} from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {
  Test,
  TestExecution,
  TestKey,
  TestPlan,
  TestRun,
} from 'faros-airbyte-common/xray';
import {makeAxiosInstanceWithRetry, wrapApiError} from 'faros-js-client';
import * as fs from 'fs';
import {get} from 'lodash';
import {DateTime} from 'luxon';
import path from 'path';
import {Memoize} from 'typescript-memoize';
import VError, {MultiError} from 'verror';

import {XrayConfig} from './types';

const XRAY_CLOUD_BASE_URL = 'https://xray.cloud.getxray.app/api/v2';
const XRAY_API_DEFAULT_TIMEOUT = 0;
const XRAY_PAGE_LIMIT = 100;
// Limit is 60 calls per minute: https://docs.getxray.app/display/ProductKB/%5BXray+Cloud%5D+Rest+API+Limit
const XRAY_DEFAULT_RETRY_DELAY = 30_000;

export class Xray {
  private static xray: Xray;
  constructor(
    private readonly api: AxiosInstance,
    private readonly limit,
    private readonly logger?: AirbyteLogger
  ) {}

  static async instance(
    config: XrayConfig,
    logger?: AirbyteLogger
  ): Promise<Xray> {
    if (Xray.xray) return Xray.xray;

    const delayLogic = (error: AxiosError<unknown, any>): number => {
      const jitter = 500;
      const resetHeader = error?.response?.headers['x-ratelimit-reset'];
      if (resetHeader) {
        // Value is a date string in like Thu Jun 20 2024 21:15:15 GMT+0000 (Coordinated Universal Time)
        const resetTime = DateTime.fromJSDate(new Date(resetHeader));
        if (!resetTime.isValid) {
          logger?.warn(
            `Failed to process rate limit reset time value: ${resetHeader}`
          );
        }
        const diff = resetTime.diff(DateTime.utc()).as('milliseconds');
        if (diff > 0) {
          const wait = diff + jitter;
          logger?.warn(
            `Retrying in ${wait} milliseconds using at ${resetHeader}`
          );
          return wait;
        }
      }
      const wait = XRAY_DEFAULT_RETRY_DELAY + jitter;
      logger?.warn(`Retrying in ${wait} milliseconds using default delay`);
      return wait;
    };
    const api = makeAxiosInstanceWithRetry(
      {
        baseURL: XRAY_CLOUD_BASE_URL,
        timeout: config.api_timeout ?? XRAY_API_DEFAULT_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
        },
        maxContentLength: Infinity, //default is 2000 bytes
      },
      logger?.asPino(),
      config.api_max_retries,
      delayLogic
    );

    const auth = config.authentication;
    if (!auth?.client_id || !auth?.client_secret) {
      throw new VError(
        'Please provide Xray Cloud authentication details, ' +
          'Client Id and a Client Secret'
      );
    }

    const refreshToken = async (): Promise<void> => {
      const token = await Xray.sessionToken(
        auth.client_id,
        auth.client_secret,
        logger
      );
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    };
    createAuthRefreshInterceptor(api, refreshToken, {statusCodes: [401]});

    // Limit should be a max of 100
    // https://docs.getxray.app/display/XRAYCLOUD/GraphQL+API
    const limit = config.api_page_limit
      ? Math.min(config.api_page_limit, XRAY_PAGE_LIMIT)
      : XRAY_PAGE_LIMIT;

    Xray.xray = new Xray(api, limit, logger);
    return Xray.xray;
  }

  private static async sessionToken(
    clientId: string,
    clientSecret: string,
    logger: AirbyteLogger
  ): Promise<string> {
    logger.info('Generating new session token');
    try {
      const {data} = await axios.post(`${XRAY_CLOUD_BASE_URL}/authenticate`, {
        client_id: clientId,
        client_secret: clientSecret,
      });
      return data;
    } catch (err: any) {
      throw wrapApiError(err, 'Failed to get authentication token');
    }
  }

  private static readQueryFile(fileName: string): string {
    return fs.readFileSync(
      path.join(__dirname, '..', 'resources', 'queries', fileName),
      'utf8'
    );
  }

  private async *paginate(
    queryFile: string,
    resultKey: string,
    variables?: any
  ): AsyncGenerator<any> {
    const query = Xray.readQueryFile(queryFile);
    let hasNextPage = true;
    let start = 0;
    let count = 0;

    const queryVariables = {
      limit: this.limit,
      start,
      ...variables,
    };
    while (hasNextPage) {
      let response;
      try {
        response = await this.api.post('/graphql', {
          query,
          variables: {
            limit: this.limit,
            start,
            ...variables,
          },
        });
      } catch (err: any) {
        throw wrapApiError(err, 'failed to fetch data');
      }
      if (response.data?.errors) {
        throw new MultiError(
          response.data.errors.map((e: any) => new VError(e.message))
        );
      }

      const data = get(response.data?.data, resultKey);
      const results = data.results;
      for (const result of results) {
        yield result;
        count++;
      }
      this.logger?.debug(`Fetched ${count} records of ${data.total}`);
      hasNextPage = data.total != count && results.length === data.limit;
      // Next start is the current count if hasNextPage is true
      start = count;
    }
  }

  async checkConnection(): Promise<void> {
    // Basic query to check if the connection is working
    const query = `
      query getType {
        __type(name: "Test") {
          name
          kind
          description
        }
      }
    `;
    await this.api.post('/graphql', {query});
  }

  @Memoize()
  async getTestPlans(project: string): Promise<ReadonlyArray<TestPlan>> {
    const varibles = {jql: `project = ${project}`};
    const plans = [];
    for await (const plan of this.paginate(
      'get-test-plans.gql',
      'getTestPlans',
      varibles
    )) {
      const {key, summary, description, labels} = plan.jira;
      plans.push({
        issueId: plan.issueId,
        key,
        summary,
        description,
        labels,
      });
    }
    return plans;
  }

  async *getTests(
    project: string,
    modifiedSince: string
  ): AsyncGenerator<Test> {
    const variables = {jql: `project = ${project}`, modifiedSince};
    for await (const test of this.paginate(
      'get-tests.gql',
      'getTests',
      variables
    )) {
      const {key, summary, description, labels} = test.jira;
      yield {
        issueId: test.issueId,
        key,
        summary,
        description,
        labels,
        gherkin: test.gherkin,
        unstructured: test.unstructured,
        testType: test.testType,
        status: test.status,
        steps: test.steps,
        preconditions: test.preconditions?.results?.map((p: any) => {
          const {key, rank} = p.jira;
          return {
            issueId: p.issueId,
            key,
            definition: p.definition,
            rank,
            preconditionType: p.preconditionType,
          };
        }),
        project,
        lastModified: test.lastModified,
      };
    }
  }

  async *getTestPlanTests(planId: string): AsyncGenerator<TestKey> {
    for await (const test of this.paginate(
      'get-test-plan-tests.gql',
      'getTestPlan.tests',
      {issueId: planId}
    )) {
      yield {
        issueId: test.issueId,
        key: test.jira.key,
      };
    }
  }

  async *getTestRuns(modifiedSince: string): AsyncGenerator<TestRun> {
    const variables = {modifiedSince};
    for await (const run of this.paginate(
      'get-test-runs.gql',
      'getTestRuns',
      variables
    )) {
      yield {
        id: run.id,
        startedOn: run.startedOn,
        finishedOn: run.finishedOn,
        defects: run.defects,
        status: run.status,
        steps: run.steps,
        lastModified: run.lastModified,
        test: {
          issueId: run.test.issueId,
          key: run.test.jira.key,
        },
        testVersion: run.testVersion,
        testExecution: {
          issueId: run.testExecution.issueId,
          key: run.testExecution.jira.key,
        },
      };
    }
  }

  async *getTestExecutions(
    project: string,
    modifiedSince: string
  ): AsyncGenerator<TestExecution> {
    const variables = {jql: `project = ${project}`, modifiedSince};
    for await (const execution of this.paginate(
      'get-test-executions.gql',
      'getTestExecutions',
      variables
    )) {
      const {key, summary, description, labels} = execution.jira;
      yield {
        issueId: execution.issueId,
        key,
        summary,
        description,
        labels,
        testEnvironments: execution.testEnvironments,
        lastModified: execution.lastModified,
        project,
      };
    }
  }
}
