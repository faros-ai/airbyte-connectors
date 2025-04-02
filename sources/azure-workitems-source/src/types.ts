import {AzureDevOpsConfig} from 'faros-airbyte-common/azure-devops';

export interface AzureWorkitemsConfig extends AzureDevOpsConfig {
  readonly additional_fields: string[];
}
