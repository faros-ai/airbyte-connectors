import axios, {AxiosInstance, AxiosResponse} from 'axios';
import {AirbyteConfig, AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {Query} from './query';
import {Work} from './types';

const DEFAULT_API_VERSION = 'v53.0';
/** The maximum batch size is 2,000 records, but this number is only a suggestion.
 * To maximize performance, the requested batch size isn’t necessarily the actual batch size */
const DEFAULT_PAGE_SIZE = 2000;

export interface AgileacceleratorConfig extends AirbyteConfig {
  readonly server_url: string;
  readonly client_id: string;
  readonly client_secret: string;
  readonly username: string;
  readonly password: string;
  readonly api_token: string;
  readonly cutoff_days: number;
  readonly api_version?: string;
  readonly page_size?: number;
}

interface AgileacceleratorAuthResponse {
  readonly access_token: string;
  readonly instance_url: string;
  readonly id: string;
  readonly token_type: string;
  readonly issued_at: string;
  readonly signature: string;
}

interface AuthParams {
  accessToken: string;
  tokenType: string;
}

/**
 * @param {string} T - A type of resource to fetch
 */
interface GraphQLRes<T> {
  records: T[];
  done: boolean;
  totalSize?: number;
}

export class Agileaccelerator {
  private static agileaccelerator: Agileaccelerator = null;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly baseUrl: string,
    private readonly pageSize: number,
    readonly startDate: Date
  ) {}

  static async instance(
    config: AgileacceleratorConfig,
    logger: AirbyteLogger
  ): Promise<Agileaccelerator> {
    if (Agileaccelerator.agileaccelerator)
      return Agileaccelerator.agileaccelerator;

    if (!config.server_url) {
      throw new VError('server_url must not be an empty string');
    }
    if (!config.client_id) {
      throw new VError('client_id must not be an empty string');
    }
    if (!config.client_secret) {
      throw new VError('client_secret must not be an empty string');
    }
    if (!config.username) {
      throw new VError('username must not be an empty string');
    }
    if (!config.password) {
      throw new VError('password must not be an empty string');
    }
    if (!config.api_token) {
      throw new VError('api_token must not be an empty string');
    }
    if (!config.cutoff_days) {
      throw new VError('cutoff_days is null or empty');
    }

    const authParams = await Agileaccelerator.authorize(config);
    const apiVersion = config.api_version || DEFAULT_API_VERSION;

    const httpClient = axios.create({
      baseURL: `${config.server_url}/services/data/${apiVersion}`,
      timeout: 5000, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes
      headers: {
        Authorization: `${authParams.tokenType} ${authParams.accessToken}`,
      },
    });
    const pageSize = config.page_size || DEFAULT_PAGE_SIZE;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - config.cutoff_days);
    Agileaccelerator.agileaccelerator = new Agileaccelerator(
      httpClient,
      config.server_url,
      pageSize,
      startDate
    );
    return Agileaccelerator.agileaccelerator;
  }

  static async authorize(config: AgileacceleratorConfig): Promise<AuthParams> {
    try {
      const res = await axios.post<AgileacceleratorAuthResponse>(
        '/services/oauth2/token',
        null,
        {
          baseURL: config.server_url,
          timeout: 5000, // default is `0` (no timeout)
          maxContentLength: Infinity, //default is 2000 bytes
          params: {
            grant_type: 'password',
            client_id: config.client_id,
            client_secret: config.client_secret,
            username: config.username,
            password: config.password.concat(config.api_token),
          },
        }
      );

      return {
        accessToken: res.data.access_token,
        tokenType: res.data.token_type,
      };
    } catch (err: any) {
      Agileaccelerator.errorHandler(err);
    }
  }

  static errorHandler(err: any): void {
    let errorMessage = 'Please verify your credentials are correct. Error: ';
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

  async checkConnection(config: AgileacceleratorConfig): Promise<void> {
    await Agileaccelerator.authorize(config);
  }

  private async errorWrapper<T>(func: () => Promise<T>): Promise<T> {
    let res: T;
    try {
      res = await func();
    } catch (err: any) {
      if (err.error_code || err.error_info) {
        throw new VError(`${err.error_code}: ${err.error_info}`);
      }
      let errorMessage;
      try {
        errorMessage = err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage = wrapError.message;
      }
      throw new VError(errorMessage);
    }
    return res;
  }

  private async *paginate<T>(
    func: (date?: Date) => Promise<AxiosResponse<GraphQLRes<T>>>,
    getUpdatedAt: (item: T) => Date,
    modifiedDate: Date
  ): AsyncGenerator<T> {
    do {
      const {data} = await this.errorWrapper<AxiosResponse<GraphQLRes<T>>>(() =>
        func(modifiedDate)
      );

      if (data?.totalSize <= 0) {
        return undefined;
      }

      for (const item of data?.records ?? []) {
        const newDate = getUpdatedAt(item);
        if (newDate > modifiedDate) {
          modifiedDate = newDate;
        } else modifiedDate = undefined;
        yield {...item, baseUrl: this.baseUrl} as T;
      }
    } while (modifiedDate);
  }

  getWorks(lastModifiedDate?: string): AsyncGenerator<Work> {
    const startTime = new Date(lastModifiedDate ?? 0);
    const lastModifiedDateMax =
      startTime > this.startDate ? startTime : this.startDate;
    /** To exclude gaps in records pagination will fetch using WHERE clause */
    const offset = 0;

    const func = (
      modifiedDate?: Date
    ): Promise<AxiosResponse<GraphQLRes<Work>>> => {
      const workQuery = Query.work(
        this.pageSize,
        offset,
        modifiedDate?.toISOString()
      );

      return this.httpClient.get('/query', {
        params: {q: workQuery},
      });
    };
    const getUpdatedAt = (item: Work): Date => new Date(item.LastModifiedDate);

    return this.paginate<Work>(func, getUpdatedAt, lastModifiedDateMax);
  }
}
