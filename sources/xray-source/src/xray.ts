import axios, {AxiosInstance} from 'axios';
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
import path from 'path';
import {Memoize} from 'typescript-memoize';
import VError, {MultiError} from 'verror';

import {XrayConfig} from './types';

const XRAY_CLOUD_BASE_URL = 'https://xray.cloud.getxray.app/api/v2';
const XRAY_API_DEFAULT_TIMEOUT = 0;
const XRAY_PAGE_LIMIT = 100;

export class Xray {
  private static xray: Xray;
  private readonly limit = XRAY_PAGE_LIMIT;
  constructor(
    private readonly api: AxiosInstance,
    private readonly logger?: AirbyteLogger
  ) {}

  static async instance(
    config: XrayConfig,
    logger?: AirbyteLogger
  ): Promise<Xray> {
    if (Xray.xray) return Xray.xray;
    const api = makeAxiosInstanceWithRetry(
      {
        baseURL: XRAY_CLOUD_BASE_URL,
        timeout: config.api_timeout ?? XRAY_API_DEFAULT_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
        },
        maxContentLength: Infinity, //default is 2000 bytes
      },
      logger?.asPino()
    );

    const auth = config.authentication;
    if (!auth?.client_id || !auth?.client_secret) {
      throw new VError(
        'Please provide Xray Cloud authentication details, ' +
          'Client Id and a Client Secret'
      );
    }

    const refreshToken = async (): Promise<void> => {
      const token = await Xray.sessionToken(auth.client_id, auth.client_secret);
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
