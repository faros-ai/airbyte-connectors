import axios, {AxiosInstance} from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry, wrapApiError} from 'faros-js-client';
import * as fs from 'fs';
import {get} from 'lodash';
import path from 'path';
import VError from 'verror';

import {
  Test,
  TestExecution,
  TestKey,
  TestPlan,
  TestRun,
  XrayConfig,
} from './types';

const XRAY_CLOUD_BASE_URL = 'https://xray.cloud.getxray.app/api/v2';
const XRAY_DEFAULT_TIMEOUT = 5000;

export class Xray {
  private static xray: Xray;
  private readonly limit = 100;
  constructor(
    private readonly api: AxiosInstance,
    private readonly logger?: AirbyteLogger
  ) {}

  static async instance(
    config: XrayConfig,
    logger?: AirbyteLogger
  ): Promise<Xray> {
    if (Xray.xray) return Xray.xray;

    if (!config.client_id || !config.client_secret) {
      throw new VError(
        'Please provide Xray Cloud authentication details, ' +
          'Client Id and a Client Secret'
      );
    }

    const api = makeAxiosInstanceWithRetry(
      {
        baseURL: XRAY_CLOUD_BASE_URL,
        timeout: config.timeout ?? XRAY_DEFAULT_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
        },
        maxContentLength: Infinity, //default is 2000 bytes
      },
      logger?.asPino()
    );

    const refreshToken = async (): Promise<void> => {
      const token = await Xray.sessionToken(
        config.client_id,
        config.client_secret
      );
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    };
    createAuthRefreshInterceptor(api, refreshToken, {statusCodes: [401]});

    return new Xray(api, logger);
  }

  private static async sessionToken(
    clientId: string,
    clientSecret: string
  ): Promise<string> {
    try {
      const {data} = await axios.post(`${XRAY_CLOUD_BASE_URL}/authenticate`, {
        client_id: clientId,
        client_secret: clientSecret,
      });
      return data;
    } catch (err: any) {
      throw wrapApiError(err, 'failed to get authentication token');
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
    let start = null;
    let count = 0;

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

      const data = get(response.data?.data, resultKey);
      const results = data.results;
      for (const result of results) {
        yield result;
        count++;
      }
      hasNextPage = data.total != count && data.results.length === data.limit;
      start = results.length;
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

  // TODO - Memoize
  async getTestPlans(): Promise<ReadonlyArray<TestPlan>> {
    const plans = [];
    for await (const plan of this.paginate(
      'get-test-plans.gql',
      'getTestPlans'
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

  // TODO - Make incremental
  // TODO - Investigate total is more than actual returned results
  async *getTests(): AsyncGenerator<Test> {
    for await (const test of this.paginate('get-tests.gql', 'getTests')) {
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

  async *getTestRuns(): AsyncGenerator<TestRun> {
    for await (const run of this.paginate('get-test-runs.gql', 'getTestRuns')) {
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

  async *getTestExecutions(): AsyncGenerator<TestExecution> {
    for await (const execution of this.paginate(
      'get-test-executions.gql',
      'getTestExecutions'
    )) {
      const {key, summary, description, labels} = execution.jira;
      yield {
        issueId: execution.issueId,
        key,
        summary,
        description,
        labels,
        testEnvironments: execution.testEnvironments,
      };
    }
  }
}
