import {AirbyteConfig} from 'faros-airbyte-cdk';

export interface GitlabConfig extends AirbyteConfig {
  readonly apiUrl?: string;
  readonly apiVersion?: number;
  readonly token: string;
  readonly groupName: string;
  readonly projects: string[];
  readonly pageSize?: number;
  readonly maxPipelinesPerProject?: number;
}

export interface Group {
  readonly id: number;
  readonly createdAt: string;
  readonly description: string;
  readonly name: string;
  readonly path: string;
  readonly fullPath: string;
  readonly visibility: string;
  readonly webUrl: string;
}

export interface Job {
  readonly id: number;
  readonly duration: number;
  readonly name: string;
  readonly createdAt: string;
  readonly finishedAt: string;
  readonly startedAt: string;
  readonly pipeline: Pipeline;
  readonly stage: string;
  readonly status: string;
  readonly webUrl: string;
}

export interface Pipeline {
  readonly id: number;
  readonly commitSha: string;
  readonly projectId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly webUrl: string;
}

export interface Project {
  readonly id: number;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly defaultBranch: string;
  readonly description: string;
  readonly name: string;
  readonly path: string;
  readonly pathWithNamespace: string;
  readonly visibility: string;
  readonly webUrl: string;
}

export type RequestOptions = {
  perPage: number;
  updatedAfter: string;
  orderBy: string;
  showExpanded: boolean;
};
