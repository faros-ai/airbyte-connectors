import axios, {AxiosInstance, isAxiosError} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {Group, User, UserResponse} from './models';

const DEFAULT_AUTH_VERSION = 'v2.0';
const DEFAULT_VERSION = 'v1.0';
const AUTH_URL = 'https://login.microsoftonline.com';

export interface AzureActiveDirectoryConfig {
  readonly client_id: string;
  readonly client_secret: string;
  readonly tenant_id: string;
  readonly auth_version?: string;
  readonly version?: string;
  readonly fetch_teams?: boolean;
}

export class AzureActiveDirectory {
  private static azureActiveDirectory: AzureActiveDirectory = null;
  private readonly noManagerUsers = new Set<string>();

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: AzureActiveDirectoryConfig,
    logger: AirbyteLogger
  ): Promise<AzureActiveDirectory> {
    if (AzureActiveDirectory.azureActiveDirectory)
      return AzureActiveDirectory.azureActiveDirectory;

    if (!config.client_id) {
      throw new VError('client_id must not be an empty string');
    }

    if (!config.client_secret) {
      throw new VError('client_secret must not be an empty string');
    }

    if (!config.tenant_id) {
      throw new VError('tenant_id must not be an empty string');
    }

    const version = config.version ?? DEFAULT_VERSION;
    const accessToken = await this.getAccessToken(config);
    const httpClient = axios.create({
      baseURL: `https://graph.microsoft.com/${version}`,
      timeout: 10000, // default is `0` (no timeout)
      maxContentLength: Infinity, //default is 2000 bytes
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    AzureActiveDirectory.azureActiveDirectory = new AzureActiveDirectory(
      httpClient,
      logger
    );
    return AzureActiveDirectory.azureActiveDirectory;
  }

  private static async getAccessToken(
    config: AzureActiveDirectoryConfig
  ): Promise<string> {
    const data = new URLSearchParams({
      client_id: config.client_id,
      scope: 'https://graph.microsoft.com/.default',
      client_secret: config.client_secret,
      grant_type: 'client_credentials',
    });
    const version = config.auth_version ?? DEFAULT_AUTH_VERSION;
    const res = await axios.post(
      `${AUTH_URL}/${config.tenant_id}/oauth2/${version}/token`,
      data
    );
    return res.data.access_token;
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.getUsers();
      await iter.next();
    } catch (err: any) {
      let errorMessage = 'Please verify your token is correct. Error: ';
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
  }

  private async *paginate<T>(path: string, param = {}): AsyncGenerator<T> {
    let after = null;
    do {
      try {
        const res = await this.httpClient.get<T[]>(path, param);
        const linkHeader = res.data['@odata.nextLink'];
        if (linkHeader) {
          after = new URL(linkHeader).searchParams.get('$skiptoken');
          param['params']['$skiptoken'] = after;
        } else {
          after = null;
        }
        const result = res.data['value'];
        for (const item of result) {
          yield item;
        }
      } catch (err: any) {
        const w = wrapApiError(err);
        this.logger.error(
          `Failed requesting '${path}' with params ${JSON.stringify(
            param
          )}. Error: ${w.message}`,
          w.stack
        );
        throw new VError(w.message);
      }
    } while (after);
  }

  // User properties are selected from the following list:
  // https://learn.microsoft.com/en-us/graph/api/resources/user?view%3Dgraph-rest-1.0#properties
  async *getUsers(maxResults = 999): AsyncGenerator<User> {
    for await (const user of this.paginate<User>('users', {
      params: {
        $select: [
          'department',
          'createdDateTime',
          'identities',
          'streetAddress',
          'jobTitle',
          'officeLocation',
          'employeeHireDate',
          'employeeLeaveDateTime',
        ],
        $top: maxResults,
      },
    })) {
      try {
        const managerItem = await this.httpClient.get<User>(
          `users/${user.id}/manager`
        );
        if (managerItem.status === 200) {
          user.manager = managerItem.data.id;
        }
      } catch (e: any) {
        // If the user has no manager, the API returns a 404 error.
        if (isAxiosError(e) && e.response?.status === 404) {
          this.noManagerUsers.add(user.id);
        } else {
          const w = wrapApiError(e);
          this.noManagerUsers.add(user.id);
          this.logger.error(w.message, w.stack);
        }
      }
      yield user;
    }
    if (this.noManagerUsers.size > 0) {
      this.logger?.warn(
        `Failed to get managers for ${this.noManagerUsers.size} users: ${Array.from(
          this.noManagerUsers
        ).join(', ')}`
      );
    }
  }

  async *getGroups(maxResults = 999): AsyncGenerator<Group> {
    for await (const group of this.paginate<Group>('groups', {
      params: {
        $top: maxResults,
      },
    })) {
      const memberItems = await this.httpClient.get<UserResponse>(
        `groups/${group.id}/members`
      );
      if (memberItems.status === 200) {
        const members: string[] = [];
        for (const memberItem of memberItems.data.value) {
          members.push(memberItem.id);
        }
        group.members = members;
      }
      const ownerItems = await this.httpClient.get<UserResponse>(
        `groups/${group.id}/owners`
      );
      if (ownerItems.status === 200) {
        const owners: string[] = [];
        for (const ownerItem of ownerItems.data.value) {
          owners.push(ownerItem.id);
        }
        group.owners = owners;
      }
      yield group;
    }
  }
}
