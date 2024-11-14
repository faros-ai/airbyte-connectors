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
    if (!cfg.client_id || !cfg.client_secret) {
      throw new VError('Vanta client ID or secret missing.');
    }
    if (!cfg.api_url) {
      throw new VError('Api URL missing.');
    }

    // Checks apiUrl is in the correct format
    const apiUrl = new URL(cfg.api_url);

    const timeout: number = cfg.timeout ?? DEFAULT_TIMEOUT;

    const sessionToken: string = await Vanta.getSessionToken(
      apiUrl.toString(),
      cfg.client_id,
      cfg.client_secret,
      timeout
    );

    const headers = {
      'content-type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
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
      cfg.page_size ?? DEFAULT_PAGE_LIMIT,
      apiUrl.toString(),
      cfg.skip_connection_check ?? true
    );
  }

  static async getSessionToken(
    apiUrl: string,
    clientId: string,
    clientSecret: string,
    timeout: number
  ): Promise<string> {
    // The expectation is that this token will last long enough to complete the connector.
    // If that is not the case, we will need to update the connector to match the requirements

    const headers = {
      'content-type': 'application/json',
    };
    const api = axios.create({
      timeout, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes,
      maxBodyLength: Infinity, //default is 2000 bytes,
      headers,
    });
    const tokenUrl = `${apiUrl}oauth/token`;
    const body = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'vanta-api.all:read',
    };
    try {
      const packed_response: AxiosResponse = await api.post(tokenUrl, body, {
        headers,
      });
      return packed_response.data.access_token;
    } catch (error) {
      throw new VError('Failed to fetch session token: %s', error);
    }
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
    // Build asset map to get the associated repos and images for vulnerabilities.
    const assetMap = await this.buildAssetMap();

    let cursor = null;
    let hasNext = true;

    while (hasNext) {
      const {data, pageInfo} = await this.fetchVulnerabilities(cursor);

      for (const vulnerability of data) {
        const asset = assetMap.get(vulnerability.targetId);
        // Image tage scan won't be available if asset is a repository: https://developer.vanta.com/reference/listvulnerableassets#:~:text=has%20been%20scanned.-,imageScanTag,-string%20%7C%20null
        yield {
          ...vulnerability,
          repoName: asset?.name,
          imageTag: asset?.imageScanTag,
        };
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
    const params = {pageSize: this.limit, pageCursor: cursor};

    try {
      const response = await this.getAxiosResponse(url, params, 0, 1000, 'get');
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
      const response = await this.getAxiosResponse(url, params, 0, 1000, 'get');
      return response?.data?.results;
    } catch (error) {
      throw new VError('Failed to fetch vulnerability remediations: %s', error);
    }
  }

  private async fetchVulnerableAssets(cursor: string | null): Promise<any> {
    const url = `${this.apiUrl}v1/vulnerable-assets`;
    const params = {pageSize: this.limit, pageCursor: cursor};

    try {
      const response = await this.getAxiosResponse(url, params, 0, 1000, 'get');
      return response?.data?.results;
    } catch (error) {
      throw new VError('Failed to fetch vulnerable assets: %s', error);
    }
  }

  private async buildAssetMap(): Promise<Map<string, any>> {
    const assetMap = new Map<string, any>();
    let cursor = null;
    let hasNext = true;

    while (hasNext) {
      const {data, pageInfo} = await this.fetchVulnerableAssets(cursor);

      // Populate asset map with targetId as the key
      for (const asset of data) {
        assetMap.set(asset.targetId, {
          name: asset.name,
          imageScanTag: asset.imageScanTag,
        });
      }

      cursor = pageInfo.endCursor;
      hasNext = pageInfo.hasNextPage;
    }

    return assetMap;
  }

  async getAxiosResponse(
    url: string,
    bodyOrParams: any = null, // optional body parameter for GET requests
    requestCount: number = 0,
    baseDelay: number = 1000, // initial delay for exponential backoff in ms
    method: 'get' | 'post' = 'post'
  ): Promise<AxiosResponse> {
    if (requestCount > 5) {
      throw new VError('Too many retries for Vanta API');
    }
    try {
      return method === 'post'
        ? await this.api.post(url, bodyOrParams)
        : await this.api.get(url, {params: bodyOrParams});
    } catch (error: any) {
      const statusCode = error?.response?.status;

      // Handle 504 error with a fixed delay
      if (statusCode === 504) {
        this.logger.info(
          'Got 504 from Vanta API, sleeping for 30 seconds, then retrying. Retry count: %s',
          (requestCount + 1).toString()
        );
        await new Promise((resolve) => setTimeout(resolve, 30000));
        return await this.getAxiosResponse(
          url,
          bodyOrParams,
          requestCount + 1,
          baseDelay,
          method
        );
      }

      // Handle 429 error with exponential backoff
      if (statusCode === 429) {
        const delay = baseDelay * Math.pow(2, requestCount); // Exponential backoff
        this.logger.warn(
          `Received 429 error from Vanta API, retrying in ${delay / 1000} seconds (attempt ${requestCount + 1}/5).`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return await this.getAxiosResponse(
          url,
          bodyOrParams,
          requestCount + 1,
          baseDelay,
          method
        );
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
