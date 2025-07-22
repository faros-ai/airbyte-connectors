import axios, {AxiosInstance, AxiosResponse} from 'axios';
import axiosRetry, {IAxiosRetryConfig} from 'axios-retry';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {TimeWindow} from '../models';
import {
  PagedCases,
  PagedProjects,
  PagedResponse,
  PagedResults,
  PagedRuns,
  PagedSuites,
  PagedTests,
  TestRailsCase,
  TestRailsCaseType,
  TestRailsMilestone,
  TestRailsProject,
  TestRailsResult,
  TestRailsRun,
  TestRailsStatus,
  TestRailsSuite,
  TestRailsTest,
} from './testrails-models';

const DEFAULT_PAGE_SIZE = 250;
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 3;

export interface TestRailsClientConfig {
  readonly username: string;
  readonly apiKey: string;
  readonly instanceUrl: string;
  readonly pageSize?: number;
  readonly timeout?: number;
  readonly maxRetries?: number;
  readonly logger?: AirbyteLogger;
}

export class TestRailsClient {
  private readonly api: AxiosInstance;
  private readonly pageSize: number;
  private readonly logger?: AirbyteLogger;

  constructor(config: TestRailsClientConfig) {
    this.logger = config.logger;
    this.pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;

    const cleanInstanceUrl = config.instanceUrl.replace(/\/$/, '');

    this.api = axios.create({
      baseURL: `${cleanInstanceUrl}/index.php?/api/v2`,
      auth: {
        username: config.username,
        password: config.apiKey,
      },
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      maxContentLength: Infinity,
    });

    const retries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (retries > 0) {
      const retryConfig: IAxiosRetryConfig = {
        retryDelay: axiosRetry.exponentialDelay,
        shouldResetTimeout: true,
        retries,
        onRetry: (retryCount, error, requestConfig) => {
          this.logger?.info(
            `Retrying request ${requestConfig.url} due to an error: ${error.message} ` +
              `(attempt ${retryCount} of ${retries})`
          );
        },
      };
      axiosRetry(this.api, retryConfig);
    }
  }

  /**
   * Documentation:
   * https://support.testrail.com/hc/en-us/articles/7077792415124-Projects#getprojects
   */
  async *listProjects(): AsyncGenerator<TestRailsProject> {
    const projects = (res: PagedProjects): TestRailsProject[] => {
      return res.projects;
    };

    yield* this.paginate<TestRailsProject, PagedProjects>(
      '/get_projects',
      projects
    );
  }

  /**
   * Documentation:
   * https://support.testrail.com/hc/en-us/articles/7077936624276-Suites#getsuites
   * @param projectId The project to retrieve suites for
   * @returns The TestRails suites
   */
  @Memoize()
  async listSuites(projectId: string): Promise<TestRailsSuite[]> {
    const suites = [];
    for await (const suite of this.paginate(
      `/get_suites/${projectId}`,
      (res: PagedSuites) => res.suites
    )) {
      suites.push(suite);
    }
    return suites;
  }

  /**
   * Documentation:
   * https://support.testrail.com/hc/en-us/articles/7077292642580-Cases#getcases
   * @param projectId The project to retrieve cases for
   * @param window The time window to retrieve cases within
   */
  async *listCases(
    projectId: string,
    suiteId: number,
    window?: TimeWindow
  ): AsyncGenerator<TestRailsCase> {
    let window_params = '';
    if (window?.after) {
      window_params += `&updated_after=${window.after.toUnixInteger()}`;
    }
    if (window?.before) {
      window_params += `&updated_before=${window.before.toUnixInteger()}`;
    }

    const suite = `&suite_id=${suiteId}`;
    const path = '/get_cases/' + projectId + suite + window_params;

    yield* this.paginate(path, (res: PagedCases) => res.cases);
  }

  /**
   * Documentation:
   * https://support.testrail.com/hc/en-us/articles/7077792415124-Projects#getprojects
   *
   * TODO: Might not pull things that are part of test plans
   *
   * @param projectId The project to retrieve runs for
   * @param window The time window to retrieve runs within
   */
  async *listRuns(
    projectId: string,
    window?: TimeWindow
  ): AsyncGenerator<TestRailsRun> {
    let window_params = '';
    if (window?.after) {
      window_params += `&created_after=${window.after.toUnixInteger()}`;
    }
    if (window?.before) {
      window_params += `&created_before=${window.before.toUnixInteger()}`;
    }

    const path = '/get_runs/' + projectId + window_params;

    yield* this.paginate(path, (res: PagedRuns) => res.runs);
  }

  /**
   * Documentation:
   * https://support.testrail.com/hc/en-us/articles/7077990441108-Tests#gettests
   * @param runId The run for which to list tests
   */
  async *listTests(runId: number): AsyncGenerator<TestRailsTest> {
    yield* this.paginate(`/get_tests/${runId}`, (res: PagedTests) => res.tests);
  }

  /**
   * Documentation:
   * https://support.testrail.com/hc/en-us/articles/7077819312404-Results#getresultsforrun
   *
   * TODO: Might need to handle more than one result per case
   *
   * @param runId The run for which to list results
   */
  async *listRunResults(runId: number): AsyncGenerator<TestRailsResult> {
    yield* this.paginate(
      `/get_results_for_run/${runId}`,
      (res: PagedResults) => res.results
    );
  }

  /**
   * Documentation:
   * https://support.testrail.com/hc/en-us/articles/7077723976084-Milestones
   * @param id The ID of the milestone
   * @returns The TestRails milestone
   */
  @Memoize((id) => `${id}`)
  async getMilestone(id: number): Promise<TestRailsMilestone | undefined> {
    if (!id) {
      return undefined;
    }
    return this.get(`/get_milestone/${id}`);
  }

  /**
   * Documentation:
   * https://support.testrail.com/hc/en-us/articles/7077295487252-Case-Types
   * @returns The list of case types
   */
  async getCaseTypes(): Promise<TestRailsCaseType[]> {
    return this.get('/get_case_types');
  }

  /**
   * Documentation:
   * https://support.testrail.com/hc/en-us/articles/7077935129364-Statuses#getstatuses
   * @returns The list of statuses
   */
  async getStatuses(): Promise<TestRailsStatus[]> {
    return this.get('/get_statuses');
  }

  private async *paginate<T, R extends PagedResponse>(
    path: string,
    getItems: (res: R) => T[]
  ): AsyncGenerator<T> {
    const limit = this.pageSize;
    let offset = 0;
    let hasNext = true;
    while (hasNext) {
      // TestRails uses a non-standard '&' query param starter
      const page_params = `&limit=${limit}&offset=${offset}`;
      const request = this.api.get<R>(path + page_params);
      const response = await this.wrapRequest(request);

      for (const item of getItems(response)) {
        yield item;
      }

      offset += limit;
      hasNext = limit == response.size;
    }
  }

  private get<T>(path: string): Promise<T> {
    return this.wrapRequest(this.api.get(path));
  }

  private async wrapRequest<T>(request: Promise<AxiosResponse<T>>): Promise<T> {
    try {
      const {data} = await request;
      return data;
    } catch (err: any) {
      const errorMessage = wrapApiError(err).message;
      throw new VError(errorMessage);
    }
  }
}
