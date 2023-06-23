import {AirbyteRecord} from 'faros-airbyte-cdk';

import {ComputeApplication} from '../common/common';
import {Converter} from '../converter';

interface CICDOrganization {
  uid: string;
  source: string;
}

interface CICDPipeline {
  uid: string;
  organization: CICDOrganization;
}

export interface CICDBuild {
  uid: string;
  pipeline: CICDPipeline;
}

interface CICDRepository {
  uid: string;
  organization: CICDOrganization;
}

export interface CICDArtifact {
  readonly uid: string;
  readonly repository: CICDRepository;
}

export interface Execution {
  uid: string;
  application: ComputeApplication;
  startedAt: number;
  endedAt: number;
  env: string;
  status: string;
  build: CICDBuild;
  artifact: CICDArtifact;
}

export interface ExecutionImplementation {
  application: ComputeApplication;
  env: string;
  build?: CICDBuild;
  artifact?: CICDArtifact;
}

interface HarnessService {
  id: string;
  name?: string;
  artifactType: string;
  artifactSources: {
    name: string;
  }[];
}

interface HarnessEnvironment {
  type: string;
  name: string;
}

export interface HarnessExecutionNode {
  id: string;
  application: {
    id: string;
    name?: string;
    services?: {
      nodes: HarnessService[];
    };
    environments?: {
      nodes: HarnessEnvironment[];
    };
    tags?: {
      name: string;
      value: string;
    }[];
  };
  status: string;
  createdAt: number;
  startedAt: number;
  endedAt: number;
  artifacts?: {
    id: string;
    buildNo: string;
    artifactSource: {
      id: string;
      name: string;
    };
  }[];
  outcomes?: {
    nodes: {
      service: HarnessService;
      environment: HarnessEnvironment;
    }[];
  };
}

export interface ExecutionWorkflow {
  application: ComputeApplication;
  env: string;
  build: CICDBuild;
  artifact: CICDArtifact;
}

export interface ExecutionPipeline {
  application: ComputeApplication;
  env: string;
}

/** Harness converter base */
export abstract class HarnessConverter extends Converter {
  source = 'Harness';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
