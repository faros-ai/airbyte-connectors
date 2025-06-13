import {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import VError from 'verror';

import {CodacyConfig, CodacyIssue, CodacyMetrics,CodacyRepository} from './types';

export class Codacy {
  private static codacy: Codacy;
  
  constructor(
    private readonly api: AxiosInstance,
    private readonly config: CodacyConfig,
    private readonly logger?: AirbyteLogger
  ) {}

  static async instance(
    config: CodacyConfig,
    logger: AirbyteLogger
  ): Promise<Codacy> {
    if (Codacy.codacy) return Codacy.codacy;

    const apiToken = config.api_token?.trim();
    if (!apiToken) {
      throw new VError('Please provide a valid Codacy API token');
    }

    const organization = config.organization?.trim();
    if (!organization) {
      throw new VError('Please provide a valid Codacy organization');
    }

    const baseURL = 'https://app.codacy.com/api/v3/';
    const api = makeAxiosInstanceWithRetry(
      {
        baseURL,
        timeout: config.api_timeout ?? 60000,
        headers: {
          'Content-Type': 'application/json',
          'api-token': apiToken,
        },
        maxContentLength: Infinity,
      },
      logger?.asPino(),
      config.api_max_retries
    );

    Codacy.codacy = new Codacy(api, config, logger);
    return Codacy.codacy;
  }

  async checkConnection(): Promise<void> {
    await this.getOrganizationRepositories();
  }

  async getOrganizationRepositories(): Promise<CodacyRepository[]> {
    try {
      const response = await this.api.get(`organizations/${this.config.organization}/repositories`);
      return response.data.data || [];
    } catch (err) {
      throw new VError(err, 'Failed to fetch repositories from Codacy');
    }
  }

  async *getRepositoryIssues(repositoryId: number, startDate?: Date): AsyncGenerator<CodacyIssue> {
    let cursor: string | undefined;
    
    do {
      const params: any = {
        limit: 100,
      };
      if (cursor) params.cursor = cursor;
      if (startDate) params.since = startDate.toISOString();

      try {
        const response = await this.api.get(`repositories/${repositoryId}/issues`, { params });
        const issues = response.data.data || [];
        
        for (const issue of issues) {
          yield issue;
        }
        
        cursor = response.data.pagination?.cursor;
      } catch (err) {
        throw new VError(err, `Failed to fetch issues for repository ${repositoryId}`);
      }
    } while (cursor);
  }

  async *getRepositoryMetrics(repositoryId: number, startDate?: Date): AsyncGenerator<CodacyMetrics> {
    let cursor: string | undefined;
    
    do {
      const params: any = {
        limit: 100,
      };
      if (cursor) params.cursor = cursor;
      if (startDate) params.since = startDate.toISOString();

      try {
        const response = await this.api.get(`repositories/${repositoryId}/metrics`, { params });
        const metrics = response.data.data || [];
        
        for (const metric of metrics) {
          yield metric;
        }
        
        cursor = response.data.pagination?.cursor;
      } catch (err) {
        throw new VError(err, `Failed to fetch metrics for repository ${repositoryId}`);
      }
    } while (cursor);
  }
}
