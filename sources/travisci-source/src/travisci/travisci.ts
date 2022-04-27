import axios, {AxiosError, AxiosInstance} from 'axios';
import {VError} from 'verror';

import {Dict, getIterator, RequestParams, RequestResult} from './iterator';
import {Build, Owner, Repository} from './typings';

const DEFAULT_API_URL = 'https://api.travis-ci.com';
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_API_VERSION = '3';
export interface TravisCIConfig {
  readonly api_url?: string;
  readonly api_version?: string;
  readonly token: string;
  readonly cutoff_days: number;
  readonly page_size: number;
  readonly organization: string;
}

export class TravisCI {
  constructor(
    readonly axios: AxiosInstance,
    readonly startDate: Date,
    readonly pageSize: number,
    readonly organization: string
  ) {}

  static instance(
    config: TravisCIConfig,
    axiosInstance?: AxiosInstance
  ): TravisCI {
    if (!config.token) {
      throw new VError('No token provided');
    }
    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }
    if (!config.organization) {
      throw new VError('organization is null or empty');
    }
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);

    const url = config.api_url ?? DEFAULT_API_URL;
    return new TravisCI(
      axiosInstance ??
        axios.create({
          baseURL: url,
          headers: {
            'Travis-API-Version': config.api_version ?? DEFAULT_API_VERSION,
            Authorization: `token ${config.token}`,
          },
        }),
      startDate,
      config.page_size ?? DEFAULT_PAGE_SIZE,
      config.organization
    );
  }

  async checkConnection(): Promise<void> {
    try {
      await this.axios.get(`/owner/${this.organization}`);
    } catch (error) {
      if (
        (error as AxiosError).response &&
        (error as AxiosError).response.status === 401
      ) {
        throw new VError(
          'TravisCI authorization failed. Try changing your app api token'
        );
      }

      throw new VError(
        `TravisCI api request failed: ${(error as Error).message}`
      );
    }
  }
  async *fetchOwner(): AsyncGenerator<Owner> {
    const {data} = await this.axios.get(`/owner/${this.organization}`);
    yield {
      id: data.id,
      login: data.login,
      name: data.name,
      href: data['@href'],
      type: data['@type'],
    };
  }
  async *fetchRepositories(): AsyncGenerator<Repository> {
    const {data} = await this.axios.get(`repos`);
    for (const repo of data?.repositories ?? []) {
      repo.owner.type = repo.owner['@type'];
      (repo.owner.href = repo.owner['@href']), yield repo;
    }
  }
  toBuild(item: Dict): Build {
    return {
      id: item.id,
      number: item.number,
      state: item.state,
      started_at: item.started_at,
      finished_at: item.finished_at,
      href: item['@href'],
      jobs: (item.jobs || []).map((j) => ({
        id: j.id,
        created_at: j.created_at,
        finished_at: j.finished_at,
        started_at: j.started_at,
        state: j.state,
        href: j['@href'],
      })),
      commit: {
        sha: item.commit.sha,
        message: item.commit.message,
        compare_url: item.commit.compare_url,
        committed_at: item.commit.committed_at,
      },
      repository: {
        name: item.repository.name,
        slug: item.repository.slug,
      },
      created_by: {
        login: item.created_by.slug,
      },
    };
  }
  //async *fetchBuilds(since?: string): AsyncGenerator<Build> {
  fetchBuilds(since?: string): AsyncGenerator<Build> {
    const func = async (params: RequestParams): Promise<RequestResult> => {
      const result = await this.axios.get(`builds`, {params});
      return result.data as Promise<RequestResult>;
    };

    const funcParams = {
      limit: this.pageSize,
      event_type: 'push', // Get builds triggered by commits not pull requests
      sort_by: 'finished_at:asc',
      include: 'build.jobs',
    };

    const startTime = since ? since : this.startDate;
    const startDate = new Date(startTime) as Date;

    return getIterator<Build>(func, this.toBuild, funcParams, startDate);
  }
}
