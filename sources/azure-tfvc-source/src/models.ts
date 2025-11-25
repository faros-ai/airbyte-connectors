import {AzureDevOpsConfig} from 'faros-airbyte-common/azure-devops';

export interface AzureTfvcConfig extends AzureDevOpsConfig {
  readonly include_changes?: boolean;
}
