import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk/lib';
import {wrapApiError} from 'faros-feeds-sdk';
import {VError} from 'verror';

import {RefResponse, Repository, RepositoryResponse} from './models';

const DEFAULT_API_VERSION = '6.0';

export interface AzureGitConfig {
  readonly access_token: string;
  readonly organization: string;
  readonly project: string;
  readonly api_version?: string;
}

export class AzureGit {
  private static azureGit: AzureGit = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly httpVSRMClient: AxiosInstance,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: AzureGitConfig,
    logger: AirbyteLogger
  ): Promise<AzureGit> {
    if (AzureGit.azureGit) return AzureGit.azureGit;

    if (!config.access_token) {
      throw new VError('access_token must be a not empty string');
    }

    if (!config.organization) {
      throw new VError('organization must be a not empty string');
    }

    if (!config.project) {
      throw new VError('project must be a not empty string');
    }

    const version = config.api_version ?? DEFAULT_API_VERSION;
    const httpClient = axios.create({
      baseURL: `https://dev.azure.com/${config.organization}/${config.project}/_apis`,
      timeout: 10000, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes
      params: {
        'api-version': version,
      },
      headers: {
        Authorization: `Basic ${config.access_token}`,
      },
    });
    const httpVSRMClient = axios.create({
      baseURL: `https://vsrm.dev.azure.com/${config.organization}/${config.project}/_apis`,
      timeout: 10000, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes
      params: {
        'api-version': version,
      },
      headers: {
        Authorization: `Basic ${config.access_token}`,
      },
    });

    AzureGit.azureGit = new AzureGit(httpClient, httpVSRMClient, logger);
    return AzureGit.azureGit;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getRepositories();
      await iter.next();
    } catch (err: any) {
      let errorMessage = 'Please verify your access token is correct. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
  }

  async *getRepositories(): AsyncGenerator<Repository> {
    const res = await this.httpClient.get<RepositoryResponse>(
      'git/repositories'
    );
    for (const item of res.data.value) {
      const ref = await this.httpClient.get<RefResponse>(
        `git/repositories/${item.id}/refs`
      );
      if (ref.status === 200) {
        item.refs = ref.data.value;
      }
      yield item;
    }
  }
}
