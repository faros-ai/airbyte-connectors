import axios, {AxiosResponse} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Incident, IncidentRest, Pagination, User} from './models';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_SERVICE_ID_FIELD = 'name';
const INCIDENT_API = '/api/now/table/incident';
const INCIDENT_FIELDS =
  'assigned_to,business_service,closed_at,cmdb_ci,number,opened_at,opened_by,priority,severity,short_description,state,sys_id,resolved_at,sys_updated_on';
const CMDB_CI_API = '/api/now/table/cmdb_ci/';
const CMDB_CI_SERVICE_API = '/api/now/table/cmdb_ci_service/';
const USER_API = '/api/now/table/sys_user';
const USER_FIELDS = 'name,sys_id,email,sys_updated_on';

export interface ServiceNowConfig {
  readonly username: string;
  readonly password: string;
  readonly url: string;
  readonly service_id_field?: string;
  readonly cutoff_days?: number;
  readonly page_size?: number;
  readonly timeout?: number;
}

export interface ServiceNowClient {
  readonly incidents: {
    list: (
      pagination: Pagination,
      query?: string
    ) => Promise<[IncidentRest[], number]>;
  };
  readonly users: {
    list: (pagination: Pagination, query?: string) => Promise<[User[], number]>;
  };
  readonly cmdb_ci: {
    getIdentifier: (sys_id: string) => Promise<string>;
  };
  readonly cmdb_ci_service: {
    getIdentifier: (sys_id: string) => Promise<string>;
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
    let hasNext = false;
    let offset = 0;
    let query;

    if (sys_updated_on) {
      this.logger.info(`Syncing incidents updated since: ${sys_updated_on}`);
      query = `sys_updated_on>${sys_updated_on}`;
    }

    const cmdb_ci_Map: Map<string, string | undefined> = new Map();
    const business_service_Map: Map<string, string | undefined> = new Map();

    do {
      hasNext = false;
      let incidents: IncidentRest[];
      let totalCount: number;
      try {
        [incidents, totalCount] = await this.client.incidents.list(
          {pageSize, offset},
          query
        );
      } catch (err: any) {
        this.logger.error(`Error retrieving incidents: ${err.message}`);
        this.logger.error(`Will resume processing from here next sync...`);
        break;
      }

      if (incidents?.length) {
        for (const incident of incidents) {
          // When no cmdb_ci for incident, cmdb_ci is empty string
          let cmdb_ci_identifier: string | undefined;
          if (incident.cmdb_ci && typeof incident.cmdb_ci !== 'string') {
            const cmdb_ci_sys_id = incident.cmdb_ci.value;
            // If sys_id previously seen, retrieve name from map
            if (cmdb_ci_sys_id in cmdb_ci_Map) {
              cmdb_ci_identifier = cmdb_ci_Map.get(cmdb_ci_sys_id);
            } else {
              try {
                cmdb_ci_identifier =
                  await this.client.cmdb_ci.getIdentifier(cmdb_ci_sys_id);
                cmdb_ci_Map.set(cmdb_ci_sys_id, cmdb_ci_identifier);
              } catch (err: any) {
                this.logger.warn(`Error retrieving cmdb_ci: ${cmdb_ci_sys_id}`);
                cmdb_ci_Map.set(cmdb_ci_sys_id, undefined);
              }
            }
          }

          // When no business_service for incident, business_service is empty string
          let business_service_identifier: string;
          if (
            incident.business_service &&
            typeof incident.business_service !== 'string'
          ) {
            const business_service_sys_id = incident.business_service.value;
            // If sys_id previously seen, retrieve name from map
            if (business_service_sys_id in business_service_Map) {
              business_service_identifier = business_service_Map.get(
                business_service_sys_id
              );
            } else {
              try {
                business_service_identifier =
                  await this.client.cmdb_ci_service.getIdentifier(
                    business_service_sys_id
                  );
                business_service_Map.set(
                  business_service_sys_id,
                  business_service_identifier
                );
              } catch (err: any) {
                this.logger.warn(
                  `Error retrieving business_service: ${business_service_sys_id}`
                );
                business_service_Map.set(
                  business_service_identifier,
                  undefined
                );
              }
            }
          }

          // When no opened_by for incident, opened_by is empty string
          let opened_by: string;
          if (typeof incident.opened_by !== 'string') {
            opened_by = incident.opened_by.value;
          }

          // When no assigned_to for incident, assigned_to is empty string
          let assigned_to: string;
          if (typeof incident.assigned_to !== 'string') {
            assigned_to = incident.assigned_to.value;
          }

          const res: Incident = {
            sys_id: incident.sys_id,
            number: incident.number,
            short_description: incident.short_description,
            severity: incident.severity,
            priority: incident.priority,
            state: incident.state,
            assigned_to,
            opened_by,
            opened_at: incident.opened_at,
            resolved_at: incident.resolved_at,
            closed_at: incident.closed_at,
            cmdb_ci: cmdb_ci_identifier,
            business_service: business_service_identifier,
            sys_updated_on: incident.sys_updated_on,
          };

          yield res;
        }

        if (offset + pageSize < totalCount) {
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
    let hasNext;
    let offset = 0;
    let query;
    if (sys_updated_on) {
      this.logger.info(`Syncing users updated since: ${sys_updated_on}`);
      query = `sys_updated_on>=${sys_updated_on}`;
    }
    do {
      hasNext = false;

      let users: User[];
      let totalCount: number;
      try {
        [users, totalCount] = await this.client.users.list(
          {pageSize, offset},
          query
        );
      } catch (err: any) {
        this.logger.error(`Error retrieving users: ${err.message}`);
        this.logger.error(`Will resume processing from here next sync...`);
        break;
      }

      if (users?.length) {
        for (const user of users) {
          yield user;
        }

        if (offset + pageSize < totalCount) {
          hasNext = true;
          offset += pageSize;
        }
      }
    } while (hasNext);
  }

  private static makeClient(config: ServiceNowConfig): ServiceNowClient {
    const serviceIdField = config.service_id_field ?? DEFAULT_SERVICE_ID_FIELD;
    const httpClient = axios.create({
      baseURL: `${config.url}`,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      auth: {username: config.username, password: config.password},
    });

    const client = {
      incidents: {
        list: async (
          pagination: Pagination,
          query
        ): Promise<[IncidentRest[], number]> => {
          let res: AxiosResponse;
          try {
            res = await httpClient.get(INCIDENT_API, {
              params: {
                sysparm_limit: pagination.pageSize,
                sysparm_offset: pagination.offset,
                sysparm_fields: INCIDENT_FIELDS,
                sysparm_query: query,
              },
            });
          } catch (err: any) {
            this.handleApiError(err);
          }

          return [res.data.result, parseInt(res.headers['x-total-count'])];
        },
      },
      users: {
        list: async (
          pagination: Pagination,
          query
        ): Promise<[User[], number]> => {
          let res;
          try {
            res = await httpClient.get(USER_API, {
              params: {
                sysparm_limit: pagination.pageSize,
                sysparm_offset: pagination.offset,
                sysparm_fields: USER_FIELDS,
                sysparm_query: query,
              },
            });
          } catch (err: any) {
            this.handleApiError(err);
          }

          return [res.data.result, parseInt(res.headers['x-total-count'])];
        },
      },
      cmdb_ci: {
        getIdentifier: async (sys_id: string): Promise<string> => {
          let res;
          try {
            res = await httpClient.get(CMDB_CI_API + sys_id, {
              params: {sysparm_fields: serviceIdField},
            });
          } catch (err: any) {
            this.handleApiError(err);
          }

          return res.data.result?.[serviceIdField];
        },
      },
      cmdb_ci_service: {
        getIdentifier: async (sys_id: string): Promise<string> => {
          let res;
          try {
            res = await httpClient.get(CMDB_CI_SERVICE_API + sys_id, {
              params: {sysparm_fields: serviceIdField},
            });
          } catch (err: any) {
            this.handleApiError(err);
          }

          return res.data.result?.[serviceIdField];
        },
      },
      checkConnection: async (): Promise<void> => {
        try {
          await httpClient.get(USER_API, {
            params: {
              sysparm_limit: 1,
              sysparm_offset: 0,
              sysparm_fields: 'sys_id',
            },
          });
          await httpClient.get(INCIDENT_API, {
            params: {
              sysparm_limit: 1,
              sysparm_offset: 0,
              sysparm_fields: 'sys_id',
            },
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
      errorMessage = err.message ?? err.statusText ?? wrapApiError(err);
    } catch (wrapError: any) {
      errorMessage = wrapError.message;
    }
    throw new VError(errorMessage);
  }
}
