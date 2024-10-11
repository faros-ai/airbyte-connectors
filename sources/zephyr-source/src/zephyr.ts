import {AxiosInstance} from 'axios';
import {AirbyteLogger, base64Encode} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';
import VError from 'verror';

import {AccessToken, UserPassword, ZephyrConfig} from './types';

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
      const credentials = userAuth.username + ':' + userAuth.password;
      return 'Basic ' + base64Encode(credentials);
    }

    throw new VError(
      'Either Zephyr Scale personal token or Jira username and password ' +
        'must be provided for Zephyr Scale Server'
    );
  }

  async checkConnection(): Promise<void> {
    await this.api.get('/rest/auth/1/session');
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

  async getTestCases(
    project: Record<string, any>
  ): Promise<ReadonlyArray<any>> {
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

  async getProjectId(projectKey?: string): Promise<string> {
    const response = await this.api.get(
      `rest/api/latest/project/${projectKey}`
    );
    const projectId = response.data?.id;
    return projectId;
  }

  async getProjectVersions(projectKey?: string): Promise<ReadonlyArray<any>> {
    const response = await this.api.get(
      `rest/api/latest/project/${projectKey}/versions`
    );
    const versions: any[] = [];
    const versionList = response.data;

    for (const versionData of versionList) {
      const {id, name, projectId, ...data} = versionData;

      versions.push({
        id,
        name,
        projectId,
        ...data,
      });
    }

    return versions;
  }

  async getTestCycles(
    project: Record<string, any>
  ): Promise<ReadonlyArray<any>> {
    const cycles: any[] = [];
    const projectVersions = await this.getProjectVersions(project.key);
    const configuredVersions = project.versions;
    const versionsToGetExecutionsFrom = [];
    // filter fetch versions to match the configured versions
    if (!configuredVersions?.length) {
      versionsToGetExecutionsFrom.push(...projectVersions);
    } else {
      versionsToGetExecutionsFrom.push(
        ...projectVersions.filter(({name: versionName}) =>
          configuredVersions.includes(versionName)
        )
      );
    }
    if (versionsToGetExecutionsFrom.length === 0) {
      return [];
    }

    const cyclePromises = versionsToGetExecutionsFrom.map(
      ({id: versionId, projectId}) =>
        this.api.get('/rest/zapi/latest/cycle', {
          params: {projectId, versionId},
        })
    );
    const responses = await Promise.all(cyclePromises);
    for (const response of responses) {
      const values = response.data;
      const keys = Object.keys(values);
      for (const key of keys) {
        // check if id is a positive number
        if (Number.isInteger(parseInt(key, 10)) && parseInt(key, 10) > 0) {
          const cycleData = values[key];
          const {name, versionId, projectId, ...data} = cycleData;

          cycles.push({
            id: key,
            name,
            projectId,
            versionId,
            ...data,
          });
        }
      }
    }

    return cycles;
  }

  async getTestCycleFolders(
    projectId: string,
    versionId: string,
    cycleId: string
  ): Promise<ReadonlyArray<any>> {
    const {data} = await this.api.get(
      `/rest/zapi/latest/cycle/${cycleId}/folders`,
      {
        params: {projectId, versionId},
      }
    );

    const formattedCycleFoldersData = data.map(({folderId, ...folderData}) => ({
      id: folderId,
      ...folderData,
    }));

    return formattedCycleFoldersData;
  }

  async getTestExecutions(
    project: Record<string, any>
  ): Promise<ReadonlyArray<any>> {
    const testExecutions: any[] = [];
    const testCycles = await this.getTestCycles(project);

    // filter fetch cycles to match the configured cycles
    const configuredCycles = project.cycles;
    const cyclesToGetExecutionsFrom = [];
    if (!configuredCycles?.length) {
      cyclesToGetExecutionsFrom.push(...testCycles);
    } else {
      cyclesToGetExecutionsFrom.push(
        ...testCycles.filter((cycle) => configuredCycles.includes(cycle.name))
      );
    }

    const executionPromises = await Promise.all(
      cyclesToGetExecutionsFrom.map(
        async ({
          id: cycleId,
          projectId,
          versionId,
          totalCycleExecutions,
          totalFolders,
        }) => {
          const executionPromisesList = [];

          if ((totalCycleExecutions ?? 0) > 0) {
            executionPromisesList.push(
              this.api.get('/rest/zapi/latest/execution', {params: {cycleId}})
            );
          }

          if ((totalFolders ?? 0) > 0) {
            const cycleFolders = await this.getTestCycleFolders(
              projectId,
              versionId,
              cycleId
            );

            executionPromisesList.push(
              cycleFolders.map(({id: folderId}) =>
                this.api.get('/rest/zapi/latest/execution', {
                  params: {cycleId, folderId},
                })
              )
            );
          }
          return executionPromisesList;
        }
      )
    );

    const responses = await Promise.all(executionPromises.flat(3));

    for (const response of responses) {
      const {status, executions} = response.data;

      executions.forEach((executionData) => {
        const {executionStatus: executionStatusId} = executionData;
        testExecutions.push({
          ...executionData,
          executionStatusName: status[executionStatusId]?.name,
        });
      });
    }

    return testExecutions;
  }
}
