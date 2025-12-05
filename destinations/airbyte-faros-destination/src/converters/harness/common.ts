import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

// Re-export shared types from faros-airbyte-common
export {
  CDModuleInfo,
  Organization,
  Pipeline,
  PipelineExecution,
} from 'faros-airbyte-common/harness';

// CICD model key types
export interface CICDOrganizationKey {
  uid: string;
  source: string;
}

export interface CICDPipelineKey {
  uid: string;
  organization: CICDOrganizationKey;
}

export interface CICDBuildKey {
  uid: string;
  pipeline: CICDPipelineKey;
}

/** Harness converter base */
export abstract class HarnessConverter extends Converter {
  source = 'Harness';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.identifier ?? record?.record?.data?.planExecutionId;
  }
}
