import axios, {AxiosInstance, AxiosRequestConfig} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import VError from 'verror';

import {
  AccountInfo,
  GerritChange,
  GerritConfig,
  GerritGroup,
  GerritProject,
} from './types';

export const DEFAULT_CUTOFF_DAYS = 90;
export const DEFAULT_RUN_MODE = 'Full';
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_TIMEOUT = 120000;

export interface ListProjectsOptions {
  limit?: number;
  start?: number;
  prefix?: string;
  regex?: string;
  branch?: string;
  description?: boolean;
  type?: 'code' | 'permissions' | 'all';
}

export interface ListChangesOptions {
  query?: string;
  limit?: number;
  start?: number;
  options?: string[];
}

export interface ListAccountsOptions {
  limit?: number;
  start?: number;
  query?: string;
}

export class Gerrit {
  private readonly client: AxiosInstance;
  private static instance_: Gerrit;

  constructor(
    readonly config: GerritConfig,
    readonly logger: AirbyteLogger
  ) {
    const auth = this.buildAuth(config.authentication);

    this.client = axios.create({
      baseURL: config.url.endsWith('/') ? config.url : `${config.url}/`,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      httpsAgent:
        config.reject_unauthorized !== false
          ? undefined
          : {
              rejectUnauthorized: false,
            },
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...auth.headers,
      },
      auth: auth.basicAuth,
    });

    // Add response interceptor to handle Gerrit's magic prefix
    this.client.interceptors.response.use((response) => {
      if (
        typeof response.data === 'string' &&
        response.data.startsWith(")]}'")
      ) {
        try {
          response.data = JSON.parse(response.data.slice(4));
        } catch (err) {
          this.logger.warn(`Failed to parse Gerrit response: ${err}`);
        }
      }
      return response;
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use((config) => {
      this.logger.debug(
        `Gerrit API request: ${config.method?.toUpperCase()} ${config.url}`
      );
      return config;
    });
  }

  static async instance(
    config: GerritConfig,
    logger: AirbyteLogger
  ): Promise<Gerrit> {
    if (Gerrit.instance_) return Gerrit.instance_;

    Gerrit.instance_ = new Gerrit(config, logger);
    return Gerrit.instance_;
  }

  private buildAuth(auth: GerritConfig['authentication']): {
    headers?: Record<string, string>;
    basicAuth?: {username: string; password: string};
  } {
    switch (auth.type) {
      case 'http_password':
        return {
          basicAuth: {
            username: auth.username,
            password: auth.password,
          },
        };
      case 'cookie':
        return {
          headers: {
            Cookie: auth.cookie_value,
          },
        };
      case 'git_cookie': {
        // Parse git cookie format: hostname	FALSE	/	TRUE	0	o	git-username.domain.com=1//0XXXXXXXXXX
        const cookieValue = auth.git_cookie_value.trim();

        // Handle different cookie formats
        let cookie: string;
        if (cookieValue.includes('\t')) {
          // Tab-separated .gitcookies format: hostname	FALSE	/	TRUE	0	cookieName	cookieValue
          const parts = cookieValue.split('\t');
          if (parts.length >= 7) {
            const cookieName = parts[5];
            const cookieValuePart = parts[6];
            cookie = `${cookieName}=${cookieValuePart}`;
          } else {
            throw new VError(
              'Invalid .gitcookies format. Expected tab-separated format.'
            );
          }
        } else if (cookieValue.includes(',')) {
          // Comma-separated format: hostname,FALSE,/,TRUE,timestamp,cookieName,cookieValue
          const parts = cookieValue.split(',');
          if (parts.length >= 7) {
            const cookieName = parts[5];
            const cookieValuePart = parts[6];
            cookie = `${cookieName}=${cookieValuePart}`;
          } else {
            throw new VError(
              'Invalid comma-separated cookie format. Expected 7 fields.'
            );
          }
        } else if (cookieValue.includes('=')) {
          // Direct cookie format: cookieName=cookieValue
          cookie = cookieValue;
        } else {
          throw new VError(
            'Invalid git cookie format. Expected tab-separated, comma-separated, or direct cookie format.'
          );
        }

        return {
          headers: {
            Cookie: cookie,
          },
        };
      }
      default:
        throw new VError('Unsupported authentication type');
    }
  }

  private async request<T>(
    endpoint: string,
    config?: AxiosRequestConfig
  ): Promise<T> {
    try {
      // Use authenticated endpoint
      const url = endpoint.startsWith('/a/') ? endpoint : `/a${endpoint}`;
      const response = await this.client.get<T>(url, config);
      return response.data;
    } catch (err: any) {
      if (err.response) {
        throw new VError(
          {cause: err},
          `Gerrit API error: ${err.response.status} ${err.response.statusText}: ${JSON.stringify(err.response.data)}`
        );
      }
      throw new VError(
        {cause: err},
        `Gerrit API request failed: ${err.message}`
      );
    }
  }

  async getProjects(
    options: ListProjectsOptions = {}
  ): Promise<{[key: string]: GerritProject}> {
    const params: Record<string, any> = {};

    if (options.limit) params.n = options.limit;
    if (options.start) params.S = options.start;
    if (options.prefix) params.p = options.prefix;
    if (options.regex) params.r = options.regex;
    if (options.branch) params.b = options.branch;
    if (options.description) params.d = true;
    if (options.type) params.type = options.type;

    return this.request<{[key: string]: GerritProject}>('/projects/', {params});
  }

  async getChanges(options: ListChangesOptions = {}): Promise<GerritChange[]> {
    const params: Record<string, any> = {};

    if (options.query) params.q = options.query;
    if (options.limit) params.n = options.limit;
    if (options.start) params.S = options.start;
    if (options.options?.length) {
      // Add each option as a separate 'o' parameter
      options.options.forEach((option) => {
        if (!params.o) params.o = [];
        if (Array.isArray(params.o)) {
          params.o.push(option);
        } else {
          params.o = [params.o, option];
        }
      });
    }

    return this.request<GerritChange[]>('/changes/', {params});
  }

  async getAccounts(options: ListAccountsOptions = {}): Promise<AccountInfo[]> {
    const params: Record<string, any> = {};

    if (options.limit) params.n = options.limit;
    if (options.start) params.S = options.start;
    if (options.query) params.q = options.query;

    return this.request<AccountInfo[]>('/accounts/', {params});
  }

  async getGroups(
    options: {limit?: number; start?: number} = {}
  ): Promise<{[key: string]: GerritGroup}> {
    const params: Record<string, any> = {};

    if (options.limit) params.n = options.limit;
    if (options.start) params.S = options.start;

    return this.request<{[key: string]: GerritGroup}>('/groups/', {params});
  }

  async getProjectBranches(
    project: string,
    options: {limit?: number; start?: number} = {}
  ): Promise<any[]> {
    const params: Record<string, any> = {};

    if (options.limit) params.n = options.limit;
    if (options.start) params.S = options.start;

    const encodedProject = encodeURIComponent(project);
    return this.request<any[]>(`/projects/${encodedProject}/branches/`, {
      params,
    });
  }

  async getProjectTags(
    project: string,
    options: {limit?: number; start?: number} = {}
  ): Promise<any[]> {
    const params: Record<string, any> = {};

    if (options.limit) params.n = options.limit;
    if (options.start) params.S = options.start;

    const encodedProject = encodeURIComponent(project);
    return this.request<any[]>(`/projects/${encodedProject}/tags/`, {params});
  }
}
