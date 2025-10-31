import {AirbyteLogger} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';
import VError from 'verror';

import {Case, Result, Run, Suite, TimeWindow} from '../models';
import {TestRailsClient} from './testrails-client';

const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_MAX_RUN_DURATION_DAYS = 14;

export interface TestRailsConfig {
  readonly username: string;
  readonly api_key: string;
  readonly instance_url: string;
  readonly project_names?: string[];
  readonly cutoff_days?: number;
  readonly max_run_duration_days?: number;
  readonly page_size?: number;
  readonly max_retries?: number;
  readonly timeout?: number;
  readonly reject_unauthorized?: boolean;
  readonly before?: string;
  readonly after?: string;
}

export class TestRails {
  private static inst: TestRails = null;
  private projects: Record<string, string> = {};

  private constructor(
    readonly client: TestRailsClient,
    readonly window: TimeWindow,
    readonly windowOverride: boolean,
    readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: TestRailsConfig,
    logger: AirbyteLogger
  ): Promise<TestRails> {
    if (TestRails.inst) return TestRails.inst;
    if (!config.username) {
      throw new VError('Username must be provided');
    }
    if (!config.api_key) {
      throw new VError('API Key must be provided');
    }
    if (!config.instance_url) {
      throw new VError('Instance URL must be provided');
    }
    if (config?.reject_unauthorized === false) {
      logger.warn('Disabling certificate validation');
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const client = new TestRailsClient({
      username: config.username,
      apiKey: config.api_key,
      instanceUrl: config.instance_url,
      pageSize: config.page_size,
      maxRetries: config.max_retries,
      timeout: config.timeout,
      logger,
    });

    const before = config.before ? DateTime.fromISO(config.before) : undefined;
    const after = config.after
      ? DateTime.fromISO(config.after)
      : DateTime.now().minus({
          days: config.cutoff_days ?? DEFAULT_CUTOFF_DAYS,
        });

    const window: TimeWindow = {before, after};
    const windowOverride: boolean =
      config.before != null && config.after != null;

    this.inst = new TestRails(client, window, windowOverride, logger);
    await this.inst.initializeProjects(config.project_names);
    return this.inst;
  }

  /**
   * Resolve project names to project ids. If no names are provided, then all
   * projects will be resolved.
   * @param projectNames The project names that should be resolved
   */
  private async initializeProjects(projectNames: string[] = []): Promise<void> {
    const unresolvedNames =
      projectNames.length > 0 ? new Set(projectNames) : undefined;
    const resolvedNames = [];

    for await (const project of this.client.listProjects()) {
      if (unresolvedNames?.has(project.name)) {
        this.projects[project.id] = project.name;
        resolvedNames.push(project.name);
        unresolvedNames.delete(project.name);
        if (unresolvedNames.size == 0) {
          break;
        }
      } else if (!unresolvedNames) {
        this.projects[project.id] = project.name;
        resolvedNames.push(project.name);
      }
    }

    if (unresolvedNames?.size > 0) {
      const unresolvedNamesStr = Array.from(unresolvedNames.values()).join(
        ', '
      );
      this.logger.warn(
        `The following projects could not be resolved: ${unresolvedNamesStr}`
      );
    }
    if (resolvedNames.length > 0) {
      this.logger.info(
        `TestRails initialized to sync projects: ${resolvedNames.join(', ')}`
      );
    }
    if (resolvedNames.length == 0) {
      this.logger.warn('No projects could be resolved');
    }
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.client.listProjects();
      await iter.next();
    } catch (err: any) {
      throw new VError(err, 'Error verifying connection');
    }
  }

  async *getSuites(): AsyncGenerator<Suite> {
    for (const projectId of Object.keys(this.projects)) {
      const suites = await this.client.listSuites(projectId);
      for (const suite of suites) {
        yield {
          ...suite,
          project_id: projectId,
        };
      }
    }
  }

  async *getCases(since?: number): AsyncGenerator<Case> {
    const window = this.getWindow(since);
    const typeMap = await this.getTestTypes();

    for (const projectId of Object.keys(this.projects)) {
      const suites = await this.client.listSuites(projectId);
      for (const suite of suites) {
        for await (const tc of this.client.listCases(
          projectId,
          suite.id,
          window
        )) {
          const milestone = await this.client.getMilestone(tc.milestone_id);

          yield {
            ...tc,
            project_id: projectId,
            type: typeMap.get(tc.type_id),
            milestone: milestone?.name,
          };
        }
      }
    }
  }

  async *getRuns(since?: number): AsyncGenerator<Run> {
    const window = this.getWindow(since);

    for (const projectId of Object.keys(this.projects)) {
      const runs = await this.client.listRuns(projectId, window);
      for (const run of runs) {
        const milestone = await this.client.getMilestone(run.milestone_id);

        yield {
          ...run,
          project_id: projectId,
          milestone: milestone?.name,
        };
      }
    }
  }

  async *getResults(): AsyncGenerator<Result> {
    const idToStatusMap: Map<number, string> = new Map();
    const statuses = await this.client.getStatuses();
    for (const status of statuses) {
      idToStatusMap.set(status.id, status.label);
    }

    for (const projectId of Object.keys(this.projects)) {
      // Reuse memoized runs from Runs stream (no window parameter)
      const runs = await this.client.listRuns(projectId);
      for (const run of runs) {
        const testToCaseMap: Map<number, number> = new Map();
        for await (const test of this.client.listTests(run.id)) {
          testToCaseMap.set(test.id, test.case_id);
        }

        for await (const result of this.client.listRunResults(run.id)) {
          yield {
            ...result,
            project_id: projectId,
            suite_id: run.suite_id,
            case_id: testToCaseMap.get(result.test_id),
            run_id: run.id,
            status: idToStatusMap.get(result.status_id),
          };
        }
      }
    }
  }

  private async getTestTypes(): Promise<Map<number, string>> {
    const typeMap = new Map();
    const types = await this.client.getCaseTypes();
    for (const type of types) {
      typeMap.set(type.id, type.name);
    }
    return typeMap;
  }

  private getWindow(since?: number): TimeWindow {
    if (since && !this.windowOverride) {
      const after = DateTime.fromSeconds(since);
      this.logger.info(`Syncing data since ${after}`);
      return {after};
    }
    this.logger.info(
      `Syncing data from ${this.window.after.toISODate()} to ${
        this.window.before?.toISODate() ?? 'Now'
      }`
    );
    return this.window;
  }
}
