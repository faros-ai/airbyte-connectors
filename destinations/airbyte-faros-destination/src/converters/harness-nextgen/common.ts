import {AirbyteRecord} from 'faros-airbyte-cdk';

import {ComputeApplication} from '../common/common';
import {Converter} from '../converter';

export interface CICDOrganization {
  uid: string;
  source: string;
}

export interface CICDPipeline {
  uid: string;
  organization: CICDOrganization;
}

export interface CICDBuild {
  uid: string;
  pipeline: CICDPipeline;
}

export interface HarnessNextgenOrganization {
  identifier: string;
  name: string;
  description?: string;
  tags?: Record<string, string>;
}

export interface HarnessNextgenProject {
  orgIdentifier: string;
  identifier: string;
  name: string;
  color?: string;
  modules?: string[];
  description?: string;
  tags?: Record<string, string>;
}

export interface HarnessNextgenPipeline {
  identifier: string;
  name: string;
  description?: string;
  orgIdentifier: string;
  projectIdentifier: string;
  tags?: Record<string, string>;
  stageCount?: number;
  createdAt?: number;
  lastUpdatedAt?: number;
}

export interface HarnessNextgenService {
  identifier: string;
  name: string;
  description?: string;
  orgIdentifier: string;
  projectIdentifier: string;
  tags?: Record<string, string>;
  type?: string;
}

export interface HarnessNextgenEnvironment {
  identifier: string;
  name: string;
  description?: string;
  orgIdentifier: string;
  projectIdentifier: string;
  type: string;
  tags?: Record<string, string>;
}

export interface HarnessNextgenExecution {
  planExecutionId: string;
  pipelineIdentifier: string;
  name: string;
  status: string;
  orgIdentifier: string;
  projectIdentifier: string;
  startTs?: number;
  endTs?: number;
  executionTriggerInfo?: {
    triggerType: string;
    triggeredBy?: {
      identifier?: string;
      extraInfo?: Record<string, string>;
    };
  };
  moduleInfo?: {
    cd?: {
      serviceIdentifiers?: string[];
      envIdentifiers?: string[];
      infrastructureIdentifiers?: string[];
    };
  };
  runSequence?: number;
  successfulStagesCount?: number;
  failedStagesCount?: number;
  runningStagesCount?: number;
  totalStagesCount?: number;
  gitDetails?: {
    branch?: string;
    repoIdentifier?: string;
    repoName?: string;
  };
}

export abstract class HarnessNextgenConverter extends Converter {
  source = 'HarnessNextgen';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.identifier ?? record?.record?.data?.planExecutionId;
  }
}

export function computeApplication(
  name: string,
  platform?: string
): ComputeApplication {
  return {
    name,
    platform: platform ?? '',
    uid: platform ? `${name}_${platform}` : name,
  };
}

export interface CategoryDetail {
  category: string;
  detail: string;
}

const CANCELED_STATUSES = ['aborted', 'rejected', 'abortedbyfreeze'];
const FAILED_STATUSES = ['error', 'expired', 'failed', 'errored', 'approvalrejected'];
const QUEUED_STATUSES = ['paused', 'queued', 'waiting', 'resourcewaiting', 'asyncwaiting', 'taskwaiting', 'timedwaiting', 'interventionwaiting', 'approvalwaiting', 'inputwaiting'];
const RUNNING_STATUSES = ['running', 'notstarted'];
const SUCCESS_STATUSES = ['success', 'succeeded', 'ignorefailed'];

export function toHarnessStatus(status: string): CategoryDetail {
  const s = status?.toLowerCase() ?? '';
  if (CANCELED_STATUSES.includes(s)) return {category: 'Canceled', detail: status};
  if (FAILED_STATUSES.includes(s)) return {category: 'Failed', detail: status};
  if (QUEUED_STATUSES.includes(s)) return {category: 'Queued', detail: status};
  if (RUNNING_STATUSES.includes(s)) return {category: 'Running', detail: status};
  if (SUCCESS_STATUSES.includes(s)) return {category: 'Success', detail: status};
  return {category: 'Custom', detail: status};
}
