import {
  AirbyteLogger,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
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
    farosClient?: FarosClient
  ): Promise<GroupRepoFilter> {
    const key = `${config.api_url ?? ''}:${this.getToken(config)}`;
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
      if (
        !this.config.excluded_groups?.includes(group.path) &&
        !this.config.excluded_groups?.includes(group.name)
      ) {
        groups.push(group.path);
      }
    }
    
    return groups;
  }
}
