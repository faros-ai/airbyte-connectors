import {AirbyteLogger} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {isEmpty} from 'lodash';
import VError from 'verror';

import {GitLab} from './gitlab';
import {GitLabConfig} from './types';

export class GroupFilter {
  private static _instance: GroupFilter;

  constructor(
    private readonly config: GitLabConfig,
    private readonly logger: AirbyteLogger,
    private readonly farosClient?: FarosClient
  ) {}

  static instance(
    config: GitLabConfig,
    logger: AirbyteLogger,
    farosClient?: FarosClient
  ): GroupFilter {
    if (GroupFilter._instance) {
      return GroupFilter._instance;
    }
    GroupFilter._instance = new GroupFilter(config, logger, farosClient);
    return GroupFilter._instance;
  }

  async getGroups(): Promise<ReadonlyArray<string>> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    let groups: string[] = [];

    if (this.config.groups?.length) {
      groups = [...this.config.groups];
    } else {
      for await (const group of gitlab.getGroupsIterator()) {
        groups.push(group);
      }
    }

    if (isEmpty(groups)) {
      throw new VError(
        'No visible groups remain after applying inclusion and exclusion filters'
      );
    }

    // Apply excluded groups filter
    if (this.config.excluded_groups?.length && !this.config.groups?.length) {
      const excludedGroupSet = new Set(
        this.config.excluded_groups.map((g) => g.toLowerCase())
      );
      groups = groups.filter((g) => !excludedGroupSet.has(g.toLowerCase()));
    }

    return groups;
  }
}
