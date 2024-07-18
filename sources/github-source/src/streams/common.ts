import {
  AirbyteLogger,
  AirbyteStreamBase,
  calculateUpdatedStreamState,
} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {OrgRepoFilter} from '../org-repo-filter';
import {GitHubConfig} from '../types';

export type OrgStreamSlice = {
  org: string;
};

export type RepoStreamSlice = {
  org: string;
  repo: string;
  defaultBranch: string;
};

export type StreamState = {
  readonly [orgRepoKey: string]: {
    cutoff: number;
  };
};

export enum RunMode {
  CopilotEvaluationApp = 'CopilotEvaluationApp',
  CopilotEvaluation = 'CopilotEvaluation',
  Minimum = 'Minimum',
  Standard = 'Standard',
  Full = 'Full',
}

export const CopilotEvaluationAppStreamNames = [
  'faros_copilot_seats',
  'faros_copilot_usage',
  'faros_organizations',
  'faros_users',
];

// todo: fill as streams are developed
export const CopilotEvaluationStreamNames = [
  'faros_copilot_seats',
  'faros_copilot_usage',
  'faros_organizations',
  'faros_repositories',
  'faros_pull_requests',
  'faros_users',
];

// todo: fill as streams are developed
export const MinimumStreamNames = [
  'faros_organizations',
  'faros_repositories',
  'faros_pull_requests',
  'faros_labels',
  'faros_users',
  'faros_commits',
];

// todo: fill as streams are developed
export const StandardStreamNames = [
  'faros_copilot_seats',
  'faros_copilot_usage',
  'faros_organizations',
  'faros_repositories',
  'faros_pull_requests',
  'faros_labels',
  'faros_users',
  'faros_commits',
];

// todo: fill as streams are developed
export const FullStreamNames = [
  'faros_copilot_seats',
  'faros_copilot_usage',
  'faros_organizations',
  'faros_repositories',
  'faros_pull_requests',
  'faros_labels',
  'faros_users',
  'faros_commits',
];

export const TeamStreamNames = ['faros_teams', 'faros_team_memberships'];

export const RunModeStreams = {
  [RunMode.CopilotEvaluationApp]: CopilotEvaluationAppStreamNames,
  [RunMode.CopilotEvaluation]: CopilotEvaluationStreamNames,
  [RunMode.Minimum]: MinimumStreamNames,
  [RunMode.Standard]: StandardStreamNames,
  [RunMode.Full]: FullStreamNames,
};

export abstract class StreamBase extends AirbyteStreamBase {
  readonly orgRepoFilter: OrgRepoFilter;
  constructor(
    protected readonly config: GitHubConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
    this.orgRepoFilter = new OrgRepoFilter(config, logger);
  }

  protected getUpdatedStreamState(
    latestRecordCutoff: Date,
    currentStreamState: StreamState,
    orgRepoKey: string
  ): StreamState {
    return calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      orgRepoKey
    );
  }

  protected getUpdateStartDate(cutoff?: number): Date | undefined {
    return cutoff ? Utils.toDate(cutoff) : this.config.startDate;
  }

  static orgKey(org: string): string {
    return toLower(`${org}`);
  }

  static orgRepoKey(org: string, repo: string): string {
    return toLower(`${org}/${repo}`);
  }
}

export abstract class StreamWithOrgSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<OrgStreamSlice> {
    for (const org of await this.orgRepoFilter.getOrganizations()) {
      yield {org};
    }
  }
}

export abstract class StreamWithRepoSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<RepoStreamSlice> {
    for (const org of await this.orgRepoFilter.getOrganizations()) {
      for (const repo of await this.orgRepoFilter.getRepositories(org)) {
        yield {org, repo: repo.name, defaultBranch: repo.default_branch};
      }
    }
  }
}
