import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';
import {VError} from 'verror';

import {iterate} from './iterator';
import {
  Build,
  Deployment,
  DeploymentProject,
  Plan,
  SearchResult,
} from './models';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_BUILD_TIMEOUT = 24;
export const DEFAULT_DEPLOYMENT_TIMEOUT = 24;

export interface BambooConfig {
  readonly token: string;
  readonly baseUrl: string;
  readonly pageSize?: number;
  readonly cutoffDays?: number;
  readonly projectNames?: [string];
  readonly buildTimeout?: number;
  readonly deploymentTimeout?: number;
}

export function isNewer(
  state: string,
  runningStates: string[],
  timeout: number,
  lastStartedDate?: Date,
  startedDate?: Date
): boolean {
  const isRunning = runningStates.find((s) => s === state);
  if (startedDate && isRunning) {
    // Return positive hours from started date till now
    const hoursFromStart = -Math.ceil(
      DateTime.fromJSDate(startedDate).diffNow('hours').hours
    );
    const isHoursAcceptable = hoursFromStart >= 0 && hoursFromStart <= timeout;
    const isNew = !lastStartedDate || lastStartedDate < startedDate;
    if (isHoursAcceptable && isNew) {
      return true;
    }
  }

  return false;
}
export class Bamboo {
  private static backlog: Bamboo = null;
  private readonly cfg: BambooConfig;
  constructor(private readonly httpClient: AxiosInstance, cfg: BambooConfig) {
    this.cfg = cfg;
  }
  static async instance(
    config: BambooConfig,
    logger: AirbyteLogger
  ): Promise<Bamboo> {
    if (Bamboo.backlog) return Bamboo.backlog;

    if (!config.token) {
      throw new VError('No token provided');
    }

    const httpClient = axios.create({
      baseURL: `${config.baseUrl}/rest/api/latest/`,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
    });
    Bamboo.backlog = new Bamboo(httpClient, config);
    logger.debug('Created Bamboo instance');
    return Bamboo.backlog;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getPlans();
      await iter.next();
    } catch (err: any) {
      let errorMessage = 'Could not verify token. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
  }

  async *getPlans(projectNames?: [string]): AsyncGenerator<Plan> {
    const res = await this.httpClient.get<SearchResult<Plan>>('search/plans');
    for (const item of res.data.searchResults) {
      if (!projectNames || projectNames.includes(item.searchEntity.projectName))
        yield item;
    }
  }

  async *getBuilds(
    projectNames?: [string],
    lastBuildStartedTime?: Date
  ): AsyncGenerator<Build> {
    const res = await this.httpClient.get<SearchResult<Plan>>('search/plans');
    for (const item of res.data.searchResults) {
      if (
        !projectNames ||
        projectNames.includes(item.searchEntity.projectName)
      ) {
        const buildItems = await this.getBuildsByPlanKey(
          item.searchEntity.key,
          lastBuildStartedTime
        );
        for (const buildItem of buildItems) {
          yield buildItem;
        }
      }
    }
  }

  /** rest/api/latest/result/{PROJECTKEY}-{PLANKEY}?start-index=N
    Suddenly returns FIRST (total minus N) records, not the last (from N to total) ones, so we can't use it.
    so in order to get last builds starting with id from state,
    we have to get the current latest build, guess how many builds we need to iterate (count variable)
    and iterate it, on every step checking build number (second check additionally to count).
    the same with getDeployments.
    for example current build number in state = 15. we don't know how many records have been added since the last sync
    and request with 'start-index=15' won't work. we fetch the latest build, it has build number = 40,
    we assume that 25 records (max) have been added and start iterating, checking on every step that
    the build number is more than 15 (we don't need those records with the build number 15 and less, they are already synced)*/

  async getBuildsByPlanKey(
    planKey: string,
    lastBuildStartedTime?: Date
  ): Promise<Build[]> {
    const pageSize = this.cfg.pageSize ?? DEFAULT_PAGE_SIZE;
    return await iterate<Build>(
      (startIndex) =>
        this.httpClient.get(
          `result/${planKey}?max-results=${pageSize}&start-index=${startIndex}&expand=results.result.vcsRevisions&includeAllStates=true`
        ),
      (data) => data.data.results.result,
      //pagination check - check build started time
      (item: Build) =>
        this.breaker(
          item.buildStartedTime,
          item.buildCompletedTime,
          lastBuildStartedTime
        ),
      pageSize
    );
  }

  async *getDeployments(
    lastDeploymentStartedDate?: Date
  ): AsyncGenerator<Deployment> {
    const res = await this.httpClient.get<[DeploymentProject]>(
      'deploy/project/all'
    );
    for (const item of res.data) {
      for (const environment of item.environments) {
        const deploymentItems = await this.getDeploymentsByEnvironmentId(
          environment.id,
          lastDeploymentStartedDate
        );
        for (const deploymentItem of deploymentItems) {
          const deployment = deploymentItem;
          deployment.environmentName = environment.name;
          yield deployment;
        }
      }
    }
  }

  async getDeploymentsByEnvironmentId(
    environmentId: number,
    lastDeploymentStartedDate?: Date
  ): Promise<Deployment[]> {
    const pageSize = this.cfg.pageSize ?? DEFAULT_PAGE_SIZE;
    return await iterate<Deployment>(
      (startIndex) =>
        this.httpClient.get(
          `deploy/environment/${environmentId}/results?max-results=${pageSize}&start-index=${startIndex}`
        ),
      (data) => data.data.results,
      //pagination check - check deployment started date
      (item: Deployment) =>
        this.breaker(
          item.startedDate,
          item.finishedDate,
          lastDeploymentStartedDate
        ),
      pageSize
    );
  }

  private breaker(
    startedTime: number | string,
    completedTime?: number | string,
    lastEndedTime?: Date
  ): boolean {
    const since = lastEndedTime
      ? lastEndedTime
      : DateTime.now()
          .minus({days: this.cfg.cutoffDays ?? DEFAULT_CUTOFF_DAYS})
          .toJSDate();

    const startedAt = new Date(startedTime);
    const completedAt = new Date(completedTime);
    if (!completedAt && startedAt && since >= startedAt) {
      return true;
    }
    if (completedAt && since >= completedAt) {
      return true;
    }
    return false;
  }
}
