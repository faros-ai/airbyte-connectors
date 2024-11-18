import axios, {AxiosError, AxiosInstance, AxiosResponse} from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry, wrapApiError} from 'faros-js-client';
import VError from 'verror';

import {VantaConfig} from '.';
import {getQueryFromName} from './utils';

const BASE_URL = 'https://api.vanta.com';
const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_TIMEOUT = 60000;
const DEFAULT_MAX_RETRIES = 8;
export const DEFAULT_CUTOFF_DAYS = 90;

const DEFAULT_RETRY_DELAY = 1000;

/**
 * Vanta REST API client
 *
 */
export class Vanta {
  private static vanta: Vanta;
  constructor(
    private readonly api: AxiosInstance,
    private readonly limit: number,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    cfg: VantaConfig,
    logger: AirbyteLogger
  ): Promise<Vanta> {
    if (Vanta.vanta) return Vanta.vanta;

    const delayLogic = (
      error: AxiosError<unknown, any>,
      retryNumber: number
    ): number => {
      const statusCode = error?.response?.status;
      if (statusCode == 429) {
        // Retrying using an exponential backoff as recommended in the API documentation:
        // https://developer.vanta.com/docs/faq#:~:text=What%20should%20I%20do%20if%20I%20hit%20the%20rate%20limit%3F
        const delay = DEFAULT_RETRY_DELAY * Math.pow(2, retryNumber);
        logger.warn(
          `Received 429 error from Vanta API, retrying in ${delay / 1000} seconds.`
        );
        return delay;
      }
      if (statusCode === 504) {
        logger.warn(
          'Got 504 from Vanta API, sleeping for 30 seconds, then retrying.'
        );
        return 30000;
      }
      logger.warn(
        `Retrying in ${DEFAULT_RETRY_DELAY} milliseconds using default delay.`
      );
      return DEFAULT_RETRY_DELAY;
    };

    const api = makeAxiosInstanceWithRetry(
      {
        baseURL: BASE_URL,
        timeout: cfg.api_timeout ?? DEFAULT_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
        },
        maxContentLength: Infinity, //default is 2000 bytes
      },
      logger?.asPino(),
      cfg.api_max_retries ?? DEFAULT_MAX_RETRIES,
      delayLogic
    );

    if (!cfg.client_id || !cfg.client_secret) {
      throw new VError('Vanta client ID or secret missing.');
    }

    const refreshToken = async (): Promise<void> => {
      const token = await Vanta.getSessionToken(
        cfg.client_id,
        cfg.client_secret
      );
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    };
    createAuthRefreshInterceptor(api, refreshToken, {statusCodes: [401]});

    Vanta.vanta = new Vanta(api, cfg.page_size ?? DEFAULT_PAGE_LIMIT, logger);
    return Vanta.vanta;
  }

  static async getSessionToken(
    clientId: string,
    clientSecret: string
  ): Promise<string> {
    const body = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'vanta-api.all:read',
    };
    try {
      const {data}: AxiosResponse = await axios.post(
        `${BASE_URL}/oauth/token`,
        body
      );
      return data.access_token;
    } catch (error: any) {
      throw wrapApiError(error, 'Failed to get authentication token');
    }
  }

  async checkConnection(): Promise<[boolean, VError]> {
    const query = getQueryFromName('Organization');
    const body = {
      query,
      variables: {},
    };
    try {
      const response = await this.api.post('/graphql', body);
      return [response.status === 200, undefined];
    } catch (error) {
      return [false, new VError(error, 'Connection check failed')];
    }
  }
  async *getVulnerabilities(remediatedAfter: Date): AsyncGenerator<any> {
    // Build asset map to get the associated repos and images for vulnerabilities.
    const assetMap = await this.buildAssetMap();

    let cursor = null;
    let hasNext = true;

    while (hasNext) {
      const {data, pageInfo} = await this.fetchVulnerabilities(
        cursor,
        remediatedAfter
      );

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

  async *getVulnerabilityRemediations(
    remediatedAfter: Date
  ): AsyncGenerator<any> {
    let cursor = null;
    let hasNext = true;

    while (hasNext) {
      const {data, pageInfo} = await this.fetchVulnerabilityRemediations(
        cursor,
        remediatedAfter
      );

      for (const vulnerability of data) {
        yield vulnerability;
      }

      cursor = pageInfo.endCursor;
      hasNext = pageInfo.hasNextPage;
    }
  }

  private async fetchVulnerabilities(
    cursor: string | null,
    slaDeadlineAfterDate: Date
  ): Promise<any> {
    const params = {
      pageSize: this.limit,
      pageCursor: cursor,
      slaDeadlineAfterDate,
    };

    try {
      const response = await this.api.get('/v1/vulnerabilities', {params});
      return response?.data?.results;
    } catch (error: any) {
      throw wrapApiError(error, 'Failed to fetch vulnerabilities: %s');
    }
  }

  private async fetchVulnerabilityRemediations(
    cursor: string | null,
    remediatedAfter: Date
  ): Promise<any> {
    const params = {pageSize: this.limit, pageCursor: cursor, remediatedAfter};

    try {
      const response = await this.api.get('/v1/vulnerability-remediations', {
        params,
      });
      return response?.data?.results;
    } catch (error: any) {
      throw wrapApiError(
        error,
        'Failed to fetch vulnerability remediations: %s'
      );
    }
  }

  private async fetchVulnerableAssets(cursor: string | null): Promise<any> {
    const params = {pageSize: this.limit, pageCursor: cursor};

    try {
      const response = await this.api.get('/v1/vulnerable-assets', {params});
      return response?.data?.results;
    } catch (error: any) {
      throw wrapApiError(error, 'Failed to fetch vulnerable assets: %s');
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
}
