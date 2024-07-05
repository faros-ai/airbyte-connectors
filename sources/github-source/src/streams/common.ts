import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';

import {OrgRepoFilter} from '../org-repo-filter';
import {GitHubConfig} from '../types';

export type OrgStreamSlice = {
  org: string;
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
  'faros_users',
];

// todo: fill as streams are developed
export const MinimumStreamNames = [
  'faros_organizations',
  'faros_repositories',
  'faros_users',
];

// todo: fill as streams are developed
export const StandardStreamNames = [
  'faros_copilot_seats',
  'faros_copilot_usage',
  'faros_organizations',
  'faros_repositories',
  'faros_users',
];

// todo: fill as streams are developed
export const FullStreamNames = [
  'faros_copilot_seats',
  'faros_copilot_usage',
  'faros_organizations',
  'faros_repositories',
  'faros_users',
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
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(logger);
    this.orgRepoFilter = new OrgRepoFilter(config, logger, farosClient);
  }
}

export abstract class StreamWithOrgSlices extends StreamBase {
  async *streamSlices(): AsyncGenerator<OrgStreamSlice> {
    for (const org of await this.orgRepoFilter.getOrganizations()) {
      yield {org};
    }
  }
}
