import axios from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import path from 'path';
import VError from 'verror';

import {Incident, Pagination, User} from './models';

const DEFAULT_PAGE_SIZE = 100;
const GRAPHQL_API = '/api/now/graphQL';

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
}

export class ServiceNow {
  private static servicenow: ServiceNow;

  constructor(
    readonly client: ServiceNowClient,
    readonly config: ServiceNowConfig,
    readonly logger: AirbyteLogger
  ) {}

  static instance(config: ServiceNowConfig, logger: AirbyteLogger): ServiceNow {
    if (ServiceNow.servicenow) return ServiceNow.servicenow;

    const client = this.makeClient(config);

    return new ServiceNow(client, config, logger);
  }

  async checkConnection(): Promise<void> {
    try {
      // Retrieve a single user to verify connection
      await this.client.users.list({pageSize: 1, offset: 0});
    } catch (err: any) {
      throw new VError(err.message ?? JSON.stringify(err));
    }
  }

  // Retrieve incidents that have been modified since lastModified
  // or retrieve all incidents if lastModified not set
  async *getIncidents(
    sys_updated_on?: Date,
    pageSize = this.config.page_size ?? DEFAULT_PAGE_SIZE
  ): AsyncGenerator<Incident, any, any> {
    let offset = 0;
    let hasNext = false;
    let queryCondition = '';
    if (sys_updated_on) {
      queryCondition = `sys_updated_on>=${sys_updated_on.toISOString()}`;
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

  // Retrieve users that have been modified since lastModified
  // or retrieve all users if lastModified not set
  async *getUsers(
    sys_updated_on?: Date,
    pageSize = this.config.page_size ?? DEFAULT_PAGE_SIZE
  ): AsyncGenerator<User, any, any> {
    let offset = 0;
    let hasNext = false;
    let queryCondition = '';
    if (sys_updated_on) {
      queryCondition = `sys_updated_on>=${sys_updated_on.toISOString()}`;
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
      // headers: {Authorization: auth}, TODO: figure out auth
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
                queryConditions: queryConditions,
              },
            });
          } catch (err: any) {
            this.handleApiError(err);
          }

          return res?.data?.GlideRecord_Query?.incident?._results;
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
                queryConditions: queryConditions,
              },
            });
          } catch (err: any) {
            this.handleApiError(err);
          }

          return res?.data?.GlideRecord_Query?.incident?._results;
        },
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
