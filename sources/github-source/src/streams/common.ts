import {
  AirbyteLogger,
  AirbyteStreamBase,
  calculateUpdatedStreamState,
} from 'faros-airbyte-cdk';
import {FarosClient, Utils} from 'faros-js-client';
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

export type EnterpriseStreamSlice = {
  enterprise: string;
};

export type StreamState = {
  readonly [orgRepoKey: string]: {
    cutoff: number;
  };
};

export enum RunMode {
  EnterpriseCopilotOnly = 'EnterpriseCopilotOnly',
  EnterpriseCopilotUserUsageOnly = 'EnterpriseCopilotUserUsageOnly',
  CopilotEvaluationApp = 'CopilotEvaluationApp',
  CopilotEvaluation = 'CopilotEvaluation',
  Minimum = 'Minimum',
  Full = 'Full',
  Custom = 'Custom',
}

export const EnterpriseCopilotOnlyStreamNames = [
  'faros_enterprises',
  'faros_enterprise_copilot_seats',
  'faros_enterprise_copilot_usage',
  'faros_enterprise_teams',
  'faros_enterprise_team_memberships',
];

export const EnterpriseCopilotUserUsageOnlyStreamNames = [
  'faros_enterprises',
  'faros_enterprise_copilot_seats',
  'faros_enterprise_copilot_user_usage',
];

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
  'faros_organizations',
  'faros_pull_requests',
  'faros_repositories',
  'faros_users',
];

export const FullStreamNames = [
  'faros_commits',
  'faros_copilot_seats',
  'faros_copilot_usage',
  'faros_organizations',
  'faros_pull_requests',
  'faros_pull_request_comments',
  'faros_repositories',
  'faros_users',
];

// fill as streams are developed
export const CustomStreamNames = [
  'faros_artifacts',
  'faros_code_scanning_alerts',
  'faros_commits',
  'faros_copilot_seats',
  'faros_copilot_usage',
  'faros_dependabot_alerts',
  'faros_deployments',
  'faros_enterprises',
  'faros_enterprise_copilot_seats',
  'faros_enterprise_copilot_usage',
  'faros_enterprise_copilot_user_usage',
  'faros_enterprise_teams',
  'faros_enterprise_team_memberships',
  'faros_issues',
  'faros_issue_comments',
  'faros_labels',
  'faros_organizations',
  'faros_outside_collaborators',
  'faros_projects',
  'faros_pull_requests',
  'faros_pull_request_comments',
  'faros_releases',
  'faros_repositories',
  'faros_saml_sso_users',
  'faros_secret_scanning_alerts',
  'faros_stats',
  'faros_tags',
  'faros_users',
  'faros_workflows',
  'faros_workflow_jobs',
  'faros_workflow_runs',
];

export const TeamStreamNames = ['faros_teams', 'faros_team_memberships'];

export const RunModeStreams: {
  [key in RunMode]: string[];
} = {
  [RunMode.EnterpriseCopilotOnly]: EnterpriseCopilotOnlyStreamNames,
  [RunMode.EnterpriseCopilotUserUsageOnly]:
    EnterpriseCopilotUserUsageOnlyStreamNames,
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
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(logger);
    this.orgRepoFilter = OrgRepoFilter.instance(config, logger, farosClient);
  }

  protected getUpdateRange(cutoff?: number): [Date, Date] {
    return [
      cutoff ? Utils.toDate(cutoff) : this.config.startDate,
      this.config.endDate,
    ];
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

  static orgKey(org: string): string {
    return toLower(`${org}`);
  }

  static orgRepoKey(org: string, repo: string): string {
    return toLower(`${org}/${repo}`);
  }

  static enterpriseKey(enterprise: string): string {
    return toLower(`${enterprise}`);
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
      for (const {
        repo,
        syncRepoData,
      } of await this.orgRepoFilter.getRepositories(org)) {
        if (syncRepoData) {
          if (repo.recentPush) {
            yield {org, repo: repo.name};
          }
        }
      }
    }
  }
}

export abstract class StreamWithEnterpriseSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<EnterpriseStreamSlice> {
    for (const enterprise of this.config.enterprises ?? []) {
      yield {enterprise};
    }
  }
}
