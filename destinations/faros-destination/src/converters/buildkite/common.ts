import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, StreamContext} from '../converter';

export type ApplicationMapping = Record<
  string,
  {name: string; platform?: string}
>;

interface BuildkiteConfig {
  application_mapping?: ApplicationMapping;
}

export interface Organization {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly web_url: string;
}

export interface Build {
  readonly uuid: string;
  readonly number: number;
  readonly message: number;
  readonly createdAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly state: string;
  readonly url: string;
  readonly commit: string;
  readonly jobs: Array<Job>;
  readonly pipeline?: {
    slug?: string;
    readonly repository?: Repo;
    readonly organization?: {
      slug?: string;
    };
  };
}

export interface Job {
  readonly type: string;
  readonly uuid: string;
  readonly label?: string;
  readonly state: string;

  readonly createdAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;

  readonly triggered?: {
    startedAt?: string;
    createdAt?: string;
    finishedAt?: string;
  };
  readonly unblockedAt?: string;

  readonly url?: string;
  readonly command: string;
  readonly build?: {
    uuid?: string;
    readonly pipeline?: {
      slug?: string;
      readonly organization?: {
        slug?: string;
      };
    };
  };
}

export interface JobTime {
  createdAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
}

export interface JobState {
  category: string;
  detail: string;
}
export interface Pipeline {
  readonly id: string;
  readonly uuid: string;
  readonly slug: string;
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  readonly repository?: Repo;
  readonly createdAt?: string;
  readonly organization?: {
    slug?: string;
  };
}

export enum RepoSource {
  BITBUCKET = 'Bitbucket',
  GITHUB = 'GitHub',
  GITLAB = 'GitLab',
  VCS = 'VCS',
}
export interface Repo {
  readonly provider: Provider;
  readonly url: string;
}

export interface RepoExtract {
  readonly org: string;
  readonly name: string;
}

export interface Provider {
  readonly name: RepoSource;
}
/** Buildkite converter base */
export abstract class BuildkiteConverter extends Converter {
  /** Almost every Buildkite record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
