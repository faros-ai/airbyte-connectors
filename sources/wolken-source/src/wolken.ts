import {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/wolken';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import {VError} from 'verror';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_API_TIMEOUT_MS = 0; // 0 means no timeout
const DEFAULT_RETRIES = 3;
export const DEFAULT_CUTOFF_DAYS = 90;

export interface WolkenConfig {
  readonly base_url: string;
  readonly domain: string;
  readonly auth_code: string;
  readonly refresh_token: string;
  readonly client_id: string;
  readonly service_account: string;
  readonly page_size?: number;
  readonly api_timeout?: number;
  readonly max_retries?: number;
  readonly cutoff_days?: number;
  readonly start_date?: string;
  readonly end_date?: string;
  // startDate and endDate are calculated from start_date, end_date, and cutoff_days
  startDate?: Date;
  endDate?: Date;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export class TokenManager {
  private accessToken?: string;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly refreshToken: string,
    private readonly authCode: string,
    private readonly domain: string
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }
    return this.refreshAccessToken();
  }

  async refreshAccessToken(): Promise<string> {
    try {
      const response = await this.httpClient.post<TokenResponse>(
        '/oauth/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
        }),
        {
          headers: {
            accept: 'application/json',
            Authorization: `Basic ${this.authCode}`,
            domain: this.domain,
          },
        }
      );
      this.accessToken = response.data.access_token;
      return this.accessToken;
    } catch (error: any) {
      throw new VError(
        error,
        `Failed to refresh access token: ${error.message}`
      );
    }
  }
}

export class Wolken {
  private static wolken: Wolken;

  constructor(
    private readonly logger: AirbyteLogger,
    private readonly httpClient: AxiosInstance,
    private readonly tokenManager: TokenManager,
    private readonly pageSize: number
  ) {
    // Add response interceptor to handle token refresh on 401
    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;

        // Skip retry for token refresh requests
        if (
          error.response?.status === 401 &&
          !config.url?.includes('/oauth/token')
        ) {
          const token = await this.tokenManager.refreshAccessToken();
          config.headers.Authorization = `Bearer ${token}`;
          return this.httpClient(config);
        }

        return Promise.reject(new VError(error));
      }
    );
  }

  static instance(config: WolkenConfig, logger?: AirbyteLogger): Wolken {
    if (Wolken.wolken) return Wolken.wolken;

    if (!config.base_url) {
      throw new VError('Please provide base_url');
    }
    if (!config.domain) {
      throw new VError('Please provide domain');
    }
    if (!config.auth_code) {
      throw new VError('Please provide auth_code');
    }
    if (!config.refresh_token) {
      throw new VError('Please provide refresh_token');
    }
    if (!config.client_id) {
      throw new VError('Please provide client_id');
    }
    if (!config.service_account) {
      throw new VError('Please provide service_account');
    }

    const httpClient = makeAxiosInstanceWithRetry(
      {
        baseURL: config.base_url,
        timeout: config.api_timeout ?? DEFAULT_API_TIMEOUT_MS,
        maxContentLength: Infinity,
        headers: {
          domain: config.domain,
          clientId: config.client_id,
          serviceAccount: config.service_account,
        },
      },
      logger?.asPino(),
      config.max_retries ?? DEFAULT_RETRIES,
      10000
    );

    const tokenManager = new TokenManager(
      httpClient,
      config.refresh_token,
      config.auth_code,
      config.domain
    );

    Wolken.wolken = new Wolken(
      logger,
      httpClient,
      tokenManager,
      config.page_size ?? DEFAULT_PAGE_SIZE
    );

    return Wolken.wolken;
  }

  async checkConnection(): Promise<void> {
    const token = await this.tokenManager.getAccessToken();
    await this.httpClient.get('/api/masters/user/1/0', {
      headers: {Authorization: `Bearer ${token}`},
    });
  }

  async *getUsers(): AsyncGenerator<User> {
    let offset = 0;
    const token = await this.tokenManager.getAccessToken();

    try {
      let done = false;
      while (!done) {
        const response = await this.httpClient.get(
          `/api/masters/user/${this.pageSize}/${offset}`,
          {
            headers: {Authorization: `Bearer ${token}`},
          }
        );

        const users = response?.data?.data ?? [];

        this.logger.info(`Fetched ${users.length} users`);

        if (!users?.length) {
          done = true;
        } else {
          for (const user of users) {
            yield user;
          }
          offset += this.pageSize;
        }
      }
    } catch (error: any) {
      throw new VError(error, `Failed to get users: ${error.message}`);
    }
  }
}