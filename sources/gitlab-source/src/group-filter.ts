import {AirbyteLogger} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {toLower} from 'lodash';
import {Memoize} from 'typescript-memoize';
import VError from 'verror';

import {GitLab} from './gitlab';
import {RunMode} from './streams/common';
import {GitLabConfig} from './types';

type FilterConfig = {
  groups?: Set<string>;
  excludedGroups?: Set<string>;
};

export class GroupFilter {
  private readonly filterConfig: FilterConfig;
  private groups?: Set<string>;

  private static _instance: GroupFilter;
  static instance(
    config: GitLabConfig,
    logger: AirbyteLogger,
    farosClient?: FarosClient
  ): GroupFilter {
    if (!this._instance) {
      this._instance = new GroupFilter(config, logger, farosClient);
    }
    return this._instance;
  }

  constructor(
    private readonly config: GitLabConfig,
    private readonly logger: AirbyteLogger,
    private readonly farosClient?: FarosClient
  ) {
    const {groups, excluded_groups} = this.config;

    if (groups?.length && excluded_groups?.length) {
      this.logger.warn(
        'Both groups and excluded_groups are specified, excluded_groups will be ignored.'
      );
    }

    this.filterConfig = {
      groups: groups?.length ? new Set(groups) : undefined,
      excludedGroups: 
        groups?.length ? undefined : 
        (excluded_groups?.length ? new Set(excluded_groups) : undefined),
    };
  }

  @Memoize()
  async getGroups(): Promise<ReadonlyArray<string>> {
    if (!this.groups) {
      const gitlab = await GitLab.instance(this.config, this.logger);
      const visibleGroups = new Set<string>();
      
      for await (const groupPath of gitlab.getGroupsIterator()) {
        visibleGroups.add(toLower(groupPath));
      }

      if (!visibleGroups.size) {
        this.logger.warn('No visible groups found');
      }

      this.groups = await this.filterGroups(visibleGroups, gitlab);
    }

    if (this.groups.size === 0) {
      throw new VError(
        'No visible groups remain after applying inclusion and exclusion filters'
      );
    }

    return Array.from(this.groups);
  }

  private async filterGroups(
    visibleGroups: Set<string>,
    gitlab: GitLab
  ): Promise<Set<string>> {
    const groups = new Set<string>();

    if (!this.filterConfig.groups) {
      for (const group of visibleGroups) {
        const lowerGroup = toLower(group);
        if (!this.filterConfig.excludedGroups?.has(lowerGroup)) {
          groups.add(lowerGroup);
        } else {
          this.logger.info(`Skipping excluded group ${lowerGroup}`);
        }
      }
    } else {
      for (const group of this.filterConfig.groups) {
        const lowerGroup = toLower(group);
        if (await this.isVisibleGroup(visibleGroups, lowerGroup, gitlab)) {
          groups.add(lowerGroup);
        }
      }
    }

    return groups;
  }

  private async isVisibleGroup(
    visibleGroups: Set<string>,
    lowerGroup: string,
    gitlab: GitLab
  ): Promise<boolean> {
    if (visibleGroups.has(lowerGroup)) {
      return true;
    }

    // Attempt direct group lookup if not in visibleGroups
    try {
      await gitlab.getGroup(lowerGroup);
      return true;
    } catch (error: any) {
      this.logger.warn(
        `Fetching group ${lowerGroup} failed with error: ` +
          `${error.message}. Skipping.`
      );
      return false;
    }
  }
}