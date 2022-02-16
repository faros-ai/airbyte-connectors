export interface HarnessConfig {
  readonly api_url?: string;
  readonly account_id: string;
  readonly api_key: string;
  readonly cutoff_days?: number;
  readonly deploymentTimeout?: number;
  readonly page_size?: number;
}

export interface ExecutionState {
  lastEndedAt: number;
}

export type RequestResultExecutions = {
  executions: HarnessExecutions;
};

export type RequestOptionsExecutions = {
  appEnvLimit: number;
  appEnvOffset: number;
  appServiceLimit: number;
  appServiceOffset: number;
  limit: number;
  offset: number;
  endedAt?: number;
};

interface Service {
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

export interface ExecutionNode {
  id: string;
  application: {
    id: string;
    name?: string;
    services?: {
      nodes: Service[];
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
      service: Service;
      environment: HarnessEnvironment;
    }[];
  };
}

interface PageInfo {
  limit: number;
  hasMore: boolean;
}

interface HarnessExecutions {
  pageInfo: PageInfo;
  nodes: ExecutionNode[];
}
