import axios from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import path from 'path';
import VError from 'verror';

import {Incident, Pagination, User} from './models';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_CUTOFF_DAYS = 90;
const GRAPHQL_API = '/api/now/graphql';

const listIncidentsQuery = fs.readFileSync(
  path.join(__dirname, '../../resources/graphQL/listIncidentsQuery.gql'),
  'utf8'
);
const listUsersQuery = fs.readFileSync(
  path.join(__dirname, '../../resources/graphQL/listUsersQuery.gql'),
  'utf8'
);

export interface ServiceNowConfig {
  readonly username: string;
  readonly password: string;
  readonly url: string;
  readonly cutoff_days?: number;
  readonly page_size?: number;
}

export interface ServiceNowClient {
  readonly incidents: {
    list: (
      pagination: Pagination,
      queryConditions?: string
    ) => Promise<Incident[]>;
  };
  readonly users: {
    list: (pagination: Pagination, queryConditions?: string) => Promise<User[]>;
  };
  readonly checkConnection: () => Promise<void>;
}

export class ServiceNow {
  private static servicenow: ServiceNow;
  private cutOff: string;

  constructor(
    readonly client: ServiceNowClient,
    readonly config: ServiceNowConfig,
    readonly logger: AirbyteLogger
  ) {
    const threshold = new Date();
    threshold.setDate(
      threshold.getDate() - (config.cutoff_days ?? DEFAULT_CUTOFF_DAYS)
    );
    this.cutOff = threshold.toISOString();
  }

  static instance(config: ServiceNowConfig, logger: AirbyteLogger): ServiceNow {
    if (ServiceNow.servicenow) return ServiceNow.servicenow;

    const client = this.makeClient(config);

    ServiceNow.servicenow = new ServiceNow(client, config, logger);
    return ServiceNow.servicenow;
  }

  async checkConnection(): Promise<void> {
    try {
      // Retrieve a single user to verify connection
      await this.client.checkConnection();
    } catch (err: any) {
      throw new VError(err.message ?? JSON.stringify(err));
    }
  }

  // Retrieve incidents that have been modified since last sys_updated_on
  async *getIncidents(
    sys_updated_on = this.cutOff,
    pageSize = this.config.page_size ?? DEFAULT_PAGE_SIZE
  ): AsyncGenerator<Incident, any, any> {
    let offset = 0;
    let hasNext = false;
    let queryCondition = '';
    if (sys_updated_on) {
      this.logger.info(`Syncing incidents updated since: ${sys_updated_on}`);
      queryCondition = `sys_updated_on>=${sys_updated_on}`;
    }
    do {
      const incidents = await this.client.incidents.list(
        {
          pageSize,
          offset,
        },
        queryCondition
      );

      hasNext = false;
      if (incidents.length) {
        for (const incident of incidents) {
          yield incident;
        }

        if (incidents.length == pageSize) {
          hasNext = true;
          offset += pageSize;
        }
      }
    } while (hasNext);
  }

  // Retrieve users that have been modified since last sys_updated_on
  async *getUsers(
    sys_updated_on?: string,
    pageSize = this.config.page_size ?? DEFAULT_PAGE_SIZE
  ): AsyncGenerator<User, any, any> {
    let offset = 0;
    let hasNext = false;
    let queryCondition = '';
    if (sys_updated_on) {
      this.logger.info(`Syncing users updated since: ${sys_updated_on}`);
      queryCondition = `sys_updated_on>=${sys_updated_on}`;
    }
    do {
      const users = await this.client.users.list(
        {
          pageSize,
          offset,
        },
        queryCondition
      );

      hasNext = false;
      if (users.length) {
        for (const user of users) {
          yield user;
        }

        if (users.length == pageSize) {
          hasNext = true;
          offset += pageSize;
        }
      }
    } while (hasNext);
  }

  private static makeClient(config: ServiceNowConfig): ServiceNowClient {
    const httpClient = axios.create({
      baseURL: `${config.url}`,
      timeout: 5000,
      auth: {username: config.username, password: config.password},
    });

    const client = {
      incidents: {
        list: async (pagination, queryConditions) => {
          let res;
          try {
            res = await httpClient.post(GRAPHQL_API, {
              query: listIncidentsQuery,
              variables: {
                pageSize: pagination.pageSize,
                offset: pagination.offset,
                queryConditions,
              },
            });
          } catch (err: any) {
            this.handleApiError(err);
          }

          return res?.data?.data?.GlideRecord_Query?.incident?._results ?? [];
        },
      },
      users: {
        list: async (pagination, queryConditions) => {
          let res;
          try {
            res = await httpClient.post(GRAPHQL_API, {
              query: listUsersQuery,
              variables: {
                pageSize: pagination.pageSize,
                offset: pagination.offset,
                queryConditions,
              },
            });
          } catch (err: any) {
            this.handleApiError(err);
          }

          return res?.data?.data?.GlideRecord_Query?.sys_user?._results ?? [];
        },
      },
      checkConnection: async (): Promise<void> => {
        try {
          await httpClient.post(GRAPHQL_API, {
            query: listUsersQuery,
            variables: {pageSize: 1},
          });
        } catch (err: any) {
          this.handleApiError(err);
        }
      },
    };

    return client;
  }

  private static handleApiError(err: any): void {
    let errorMessage;
    try {
      errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
    } catch (wrapError: any) {
      errorMessage += wrapError.message;
    }
    throw new VError(errorMessage);
  }
}
