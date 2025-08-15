import {AzureDevOpsConfig} from 'faros-airbyte-common/azure-devops';

export interface AzureReposConfig extends AzureDevOpsConfig {
  readonly repositories?: ReadonlyArray<string>;
  readonly branch_pattern?: string;
  readonly fetch_branch_commits?: boolean;
  readonly fetch_tags?: boolean;
  readonly fetch_pull_request_work_items?: boolean;
}
