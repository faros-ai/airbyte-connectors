import {AzureDevOpsConfig} from 'faros-airbyte-common/azure-devops';

export interface AzureReposConfig extends AzureDevOpsConfig {
  readonly branch_pattern?: string;
}
