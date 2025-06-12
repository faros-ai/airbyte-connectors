import {Command} from 'commander';
import {
  AirbyteConfiguredCatalog,
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteState,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import {
  applyRoundRobinBucketing,
  calculateDateRange,
} from 'faros-airbyte-common/common';
import {FarosClient} from 'faros-js-client';
import VError from 'verror';

import {
  DEFAULT_CUTOFF_DAYS,
  DEFAULT_FAROS_API_URL,
  DEFAULT_RUN_MODE,
  GitLab,
} from './gitlab';
import {RunMode, RunModeStreams} from './streams/common';
import {FarosCommits} from './streams/faros_commits';
import {FarosGroups} from './streams/faros_groups';
import {FarosIssues} from './streams/faros_issues';
import {FarosProjects} from './streams/faros_projects';
import {FarosTags} from './streams/faros_tags';
import {FarosUsers} from './streams/faros_users';
import {GitLabConfig} from './types';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GitLabSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class GitLabSource extends AirbyteSourceBase<GitLabConfig> {
  get type(): string {
    return 'gitlab';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: GitLabConfig): Promise<[boolean, VError]> {
    try {
      const gitlab = await GitLab.instance(config, this.logger);
      await gitlab.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  makeFarosClient(config: GitLabConfig): FarosClient | undefined {
    if (!config.api_key) {
      return undefined;
    }
    return new FarosClient({
      url: config.api_url ?? DEFAULT_FAROS_API_URL,
      apiKey: config.api_key,
    });
  }

  streams(config: GitLabConfig): AirbyteStreamBase[] {
    const farosClient = this.makeFarosClient(config);
    return [
      new FarosCommits(config, this.logger, farosClient),
      new FarosGroups(config, this.logger, farosClient),
      new FarosIssues(config, this.logger, farosClient),
      new FarosProjects(config, this.logger, farosClient),
      new FarosTags(config, this.logger, farosClient),
      new FarosUsers(config, this.logger, farosClient),
    ];
  }

  async onBeforeRead(
    config: GitLabConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: GitLabConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    const streamNames = [
      ...RunModeStreams[config.run_mode ?? DEFAULT_RUN_MODE],
    ].filter(
      (streamName) =>
        config.run_mode !== RunMode.Custom ||
        !config.custom_streams?.length ||
        config.custom_streams.includes(streamName)
    );

    const streams = catalog.streams.filter((stream) =>
      streamNames.includes(stream.stream.name)
    );

    const {startDate, endDate} = calculateDateRange({
      start_date: config.start_date,
      end_date: config.end_date,
      cutoff_days: config.cutoff_days ?? DEFAULT_CUTOFF_DAYS,
      logger: this.logger.info.bind(this.logger),
    });

    const {config: newConfig, state: newState} = applyRoundRobinBucketing(
      config,
      state,
      this.logger.info.bind(this.logger)
    );

    if (config.use_faros_graph_projects_selection) {
      // No need to resolve groups, we'll use the Faros Graph to filter
      return {
        config: {
          ...newConfig,
          startDate,
          endDate,
        } as GitLabConfig,
        catalog: {streams},
        state: newState,
      };
    }

    const gitlab = await GitLab.instance(config, this.logger);
    const visibleGroups = await gitlab.getGroups();

    // Build parent-child relationships map
    const parentMap = new Map<string, string>();
    for (const group of visibleGroups) {
      if (group.parent_id) {
        parentMap.set(group.id, group.parent_id);
      }
      this.logger.debug(`Group ${group.id} has parent ${group.parent_id}`);
    }

    // Check for intersection between groups and excluded_groups
    const groups = new Set(config.groups || []);
    const excludedGroups = new Set(config.excluded_groups || []);
    const intersection = [...groups].filter((g) => excludedGroups.has(g));
    if (intersection.length > 0) {
      throw new VError(
        `Groups ${intersection.join(', ')} found in both groups and excluded_groups lists`
      );
    }

    const shouldSyncGroup = (groupId: string): boolean => {
      let currentId = groupId;
      while (currentId) {
        if (excludedGroups.has(currentId)) {
          this.logger.debug(
            `Group ${groupId}: excluded because ancestor ${currentId} is in excluded_groups`
          );
          return false;
        }
        if (groups.has(currentId)) {
          this.logger.debug(
            `Group ${groupId}: included because ancestor ${currentId} is in groups list`
          );
          return true;
        }
        currentId = parentMap.get(currentId);
      }
      // If we reach the top of the tree, we should sync only if there were no groups to sync
      // specified in the config (which means we should consider all visible groups except
      // excluded ones)
      const shouldSync = groups.size === 0;
      this.logger.debug(
        `Group ${groupId} is ${shouldSync ? 'included' : 'excluded'}: no ancestor found in either groups or excluded_groups, and the groups list is ${shouldSync ? 'empty' : 'not empty'}.`
      );
      return shouldSync;
    };

    const groupsToSync = visibleGroups
      .filter((g) => shouldSyncGroup(g.id))
      .map((g) => g.id);
    if (groupsToSync.length === 0) {
      throw new VError(
        'No visible groups remain after applying inclusion and exclusion filters'
      );
    }
    this.logger.debug(`Groups to sync: ${groupsToSync.join(', ')}`);

    return {
      config: {
        ...(newConfig as GitLabConfig),
        groups: groupsToSync,
        excluded_groups: undefined,
        startDate,
        endDate,
      } as GitLabConfig,
      catalog: {streams},
      state: newState,
    };
  }
}
