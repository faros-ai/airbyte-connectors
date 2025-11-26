import {AzureDevOpsConfig} from 'faros-airbyte-common/azure-devops';

export interface AzureTfvcConfig extends AzureDevOpsConfig {
  readonly branch_pattern?: string;
  readonly include_changes?: boolean;
  readonly include_work_items?: boolean;
}
