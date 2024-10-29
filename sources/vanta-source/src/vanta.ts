import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import VError from 'verror';

import {VantaConfig} from '.';
import {getQueryFromName} from './utils';

const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_TIMEOUT = 60000;

/**
 * Vanta REST API client
 *
 */
export class Vanta {
  constructor(
    private readonly logger: AirbyteLogger,
    private readonly api: AxiosInstance,
    private readonly limit: number,
    private readonly apiUrl: string,
    private readonly skipConnectionCheck: boolean
  ) {}

  static async instance(
    cfg: VantaConfig,
    logger: AirbyteLogger
  ): Promise<Vanta> {
    if (!cfg.token) {
      throw new VError('Vanta token missing.');
    }
    if (!cfg.apiUrl) {
      throw new VError('apiUrl missing.');
    }

    // Checks apiUrl is in the correct format
    const apiUrl = new URL(cfg.apiUrl);
    const timeout = cfg.timeout ?? DEFAULT_TIMEOUT;
    const headers = {
      'content-type': 'application/json',
      Authorization: `Bearer ${cfg.token}`,
      Accept: '*/*',
    };
    const api = axios.create({
      timeout, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes,
      maxBodyLength: Infinity, //default is 2000 bytes,
      headers,
    });

    return new Vanta(
      logger,
      api,
      cfg.limit ?? DEFAULT_PAGE_LIMIT,
      apiUrl.toString(),
      cfg.skipConnectionCheck ? cfg.skipConnectionCheck : true
    );
  }

  async checkConnection(): Promise<[boolean, VError]> {
    const query = getQueryFromName('Organization');
    const body = {
      query,
      variables: {},
    };
    try {
      const packed_response: AxiosResponse = await this.getAxiosResponse(
        this.apiUrl + '/graphql',
        body
      );
      return [packed_response.status === 200, undefined];
    } catch (error) {
      return [false, new VError(error, 'Connection check failed')];
    }
  }

  async *getVulnerabilities(): AsyncGenerator<any> {
    let cursor = null;
    let hasNext = true;

    while (hasNext) {
      const {data, pageInfo} = await this.fetchVulnerabilities(cursor);

      for (const vulnerability of data) {
        yield vulnerability;
      }

      cursor = pageInfo.endCursor;
      hasNext = pageInfo.hasNextPage;
    }
  }

  async *getVulnerabilityRemediations(): AsyncGenerator<any> {
    let cursor = null;
    let hasNext = true;

    while (hasNext) {
      const {data, pageInfo} =
        await this.fetchVulnerabilityRemediations(cursor);

      for (const vulnerability of data) {
        yield vulnerability;
      }

      cursor = pageInfo.endCursor;
      hasNext = pageInfo.hasNextPage;
    }
  }

  private async fetchVulnerabilities(cursor: string | null): Promise<any> {
    const url = `${this.apiUrl}v1/vulnerabilities`;
    console.log('url:', url);
    const params = {pageSize: this.limit, pageCursor: cursor};

    try {
      const response: AxiosResponse = await this.api.get(url, {params});
      return response?.data?.results;
    } catch (error) {
      throw new VError('Failed to fetch vulnerabilities: %s', error);
    }
  }

  private async fetchVulnerabilityRemediations(
    cursor: string | null
  ): Promise<any> {
    const url = `${this.apiUrl}v1/vulnerability-remediations`;
    const params = {pageSize: this.limit, pageCursor: cursor};

    try {
      const response: AxiosResponse = await this.api.get(url, {params});
      return response?.data?.results;
    } catch (error) {
      throw new VError('Failed to fetch vulnerability remediations: %s', error);
    }
  }

  async getAxiosResponse(
    url: string,
    body: any,
    requestCount: number = 0
  ): Promise<AxiosResponse> {
    if (requestCount > 5) {
      throw new VError('Too many retries for Vanta API');
    }
    try {
      const packed_response: AxiosResponse = await this.api.post(url, body);
      return packed_response;
    } catch (error) {
      if (error instanceof Error && error.message?.includes('504')) {
        // Sleep for 30 seconds and continue:
        this.logger.info(
          'Got 504 from Vanta API, sleeping for 30 seconds, then retrying. Retry count: %s',
          (requestCount + 1).toString()
        );
        await new Promise((resolve) => setTimeout(resolve, 30000));
        return await this.getAxiosResponse(url, body, requestCount + 1);
      }
      this.logger.error(
        `Error occurred: ${error instanceof Error ? error.message : error}`
      );
      throw new VError(
        'Error occurred while fetching data from Vanta API: %s',
        error
      );
    }
  }
}
