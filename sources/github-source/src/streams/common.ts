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
  'faros_enterprises',
  'faros_enterprise_copilot_seats',
  'faros_enterprise_copilot_usage',
  'faros_enterprise_copilot_user_engagement',
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
  private async getOrgs(): Promise<ReadonlyArray<string>> {
    return this.orgRepoFilter.getOrganizations();
  }

  async *streamSlices(): AsyncGenerator<OrgStreamSlice> {
    for (const org of await this.getOrgs()) {
      yield {org};
    }
  }

  async getSliceCount(): Promise<number> {
    return (await this.getOrgs()).length;
  }
}

export abstract class StreamWithRepoSlices extends StreamBase {
  private async getRepoSlices(): Promise<RepoStreamSlice[]> {
    const slices: RepoStreamSlice[] = [];
    for (const org of await this.orgRepoFilter.getOrganizations()) {
      for (const {
        repo,
        syncRepoData,
      } of await this.orgRepoFilter.getRepositories(org)) {
        if (syncRepoData) {
          if (repo.recentPush) {
            slices.push({org, repo: repo.name});
          }
        }
      }
    }
    return slices;
  }

  async *streamSlices(): AsyncGenerator<RepoStreamSlice> {
    for (const slice of await this.getRepoSlices()) {
      yield slice;
    }
  }

  async getSliceCount(): Promise<number> {
    return (await this.getRepoSlices()).length;
  }
}

export abstract class StreamWithEnterpriseSlices extends StreamBase {
  private getEnterprises(): string[] {
    return this.config.enterprises ?? [];
  }

  async *streamSlices(): AsyncGenerator<EnterpriseStreamSlice> {
    for (const enterprise of this.getEnterprises()) {
      yield {enterprise};
    }
  }

  async getSliceCount(): Promise<number> {
    return this.getEnterprises().length;
  }
}
