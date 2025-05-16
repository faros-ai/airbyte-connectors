import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

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
    private readonly config: GitLabConfig,
    private readonly logger: AirbyteLogger,
    private readonly farosClient?: FarosClient
  ) {}

  static async instance(
    config: GitLabConfig,
    logger: AirbyteLogger,
    farosClient?: FarosClient
  ): Promise<GroupRepoFilter> {
    const key = `${config.api_url ?? ''}:${config.token}`;
    if (!GroupRepoFilter.groupRepoFilters[key]) {
      GroupRepoFilter.groupRepoFilters[key] = new GroupRepoFilter(
        config,
        logger,
        farosClient
      );
    }
    return GroupRepoFilter.groupRepoFilters[key];
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
