import {
  AirbyteLogger,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import {
  applyRoundRobinBucketing,
  calculateDateRange,
} from 'faros-airbyte-common/common';
import {FarosClient} from 'faros-js-client';

import {GitLab} from '../gitlab';
import {GitLabConfig} from '../types';

export interface GroupStreamSlice {
  group: string;
}

export abstract class StreamWithGroupSlices extends AirbyteStreamBase {
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(logger);
    
    if (!config.startDate || !config.endDate) {
      const {startDate, endDate} = calculateDateRange({
        start_date: config.start_date,
        end_date: config.end_date,
        cutoff_days: config.cutoff_days,
        logger: (message: string) => this.logger.info(message),
      });
      config.startDate = startDate;
      config.endDate = endDate;
    }
  }

  protected async getGroupsToSync(): Promise<ReadonlyArray<string>> {
    const groupRepoFilter = await GroupRepoFilter.instance(
      this.config,
      this.logger,
      this.farosClient
    );
    return groupRepoFilter.getGroups();
  }

  async *streamSlices(): AsyncGenerator<GroupStreamSlice> {
    const groups = await this.getGroupsToSync();
    for (const group of groups) {
      yield {
        group,
      };
    }
  }
}

export class GroupRepoFilter {
  private static groupRepoFilters: Record<string, GroupRepoFilter> = {};

  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {}

  static async instance(
    config: GitLabConfig,
    logger: AirbyteLogger,
    farosClient?: FarosClient,
    state?: any
  ): Promise<GroupRepoFilter> {
    if (config.round_robin_bucket_execution) {
      const {config: updatedConfig, state: updatedState} = applyRoundRobinBucketing(
        config, state, (message: string) => logger.info(message)
      );
      config = updatedConfig;
    }
    
    const key = `${config.url ?? ''}:${this.getToken(config)}`;
    return this.getOrCreateInstance(key, () => new GroupRepoFilter(config, logger, farosClient));
  }

  private static getOrCreateInstance(
    key: string, 
    factory: () => GroupRepoFilter
  ): GroupRepoFilter {
    if (!this.groupRepoFilters[key]) {
      this.groupRepoFilters[key] = factory();
    }
    return this.groupRepoFilters[key];
  }
  
  private static getToken(config: GitLabConfig): string {
    return config.authentication?.token ?? '';
  }

  async getGroups(): Promise<ReadonlyArray<string>> {
    if (this.config.groups?.length) {
      return this.config.groups;
    }

    const gitlab = await GitLab.instance(this.config, this.logger);
    const groups: string[] = [];
    
    for await (const group of gitlab.listGroups()) {
      if (!this.isGroupExcluded(group)) {
        groups.push(group.path);
      }
    }
    
    return groups;
  }

  private isGroupExcluded(group: {path: string; name: string}): boolean {
    return !!(
      this.config.excluded_groups?.includes(group.path) ||
      this.config.excluded_groups?.includes(group.name)
    );
  }
}
