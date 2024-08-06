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
  Full = 'Full',
  Custom = 'Custom',
}

export const CopilotEvaluationAppStreamNames = [
  'faros_copilot_seats',
  'faros_copilot_usage',
  'faros_organizations',
  'faros_users',
];

export const CopilotEvaluationStreamNames = [
  'faros_copilot_seats',
  'faros_copilot_usage',
  'faros_organizations',
  'faros_pull_requests',
  'faros_repositories',
  'faros_users',
];

export const MinimumStreamNames = [
  'faros_commits',
  'faros_labels',
  'faros_organizations',
  'faros_pull_requests',
  'faros_repositories',
  'faros_users',
];

export const FullStreamNames = [
  'faros_commits',
  'faros_copilot_seats',
  'faros_copilot_usage',
  'faros_labels',
  'faros_organizations',
  'faros_pull_requests',
  'faros_pull_request_comments',
  'faros_repositories',
  'faros_users',
];

// fill as streams are developed
export const CustomStreamNames = [
  'faros_commits',
  'faros_copilot_seats',
  'faros_copilot_usage',
  'faros_labels',
  'faros_organizations',
  'faros_outside_collaborators',
  'faros_pull_requests',
  'faros_pull_request_comments',
  'faros_releases',
  'faros_repositories',
  'faros_tags',
  'faros_users',
];

export const TeamStreamNames = ['faros_teams', 'faros_team_memberships'];

export const RunModeStreams = {
  [RunMode.CopilotEvaluationApp]: CopilotEvaluationAppStreamNames,
  [RunMode.CopilotEvaluation]: CopilotEvaluationStreamNames,
  [RunMode.Minimum]: MinimumStreamNames,
  [RunMode.Full]: FullStreamNames,
  [RunMode.Custom]: CustomStreamNames,
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
        yield {org, repo: repo.name};
      }
    }
  }
}
