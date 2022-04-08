import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk/lib';
import {VError} from 'verror';

import {
  Group,
  GroupResponse,
  User,
  UserExtraInfo,
  UserResponse,
} from './models';

const DEFAULT_AUTH_VERSION = 'v2.0';
const DEFAULT_VERSION = 'v1.0';
const AUTH_URL = 'https://login.microsoftonline.com';

export interface AzureActiveDirectoryConfig {
  readonly client_id: string;
  readonly client_secret: string;
  readonly tenant_id: string;
  readonly auth_version?: string;
  readonly version?: string;
}

export class AzureActiveDirectory {
  private static azureActiveDirectory: AzureActiveDirectory = null;

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
      throw new VError('client_id must be a not empty string');
    }

    if (!config.client_secret) {
      throw new VError('client_secret must be a not empty string');
    }

    if (!config.tenant_id) {
      throw new VError('tenant_id must be a not empty string');
    }

    const version = config.version ?? DEFAULT_VERSION;
    const accessToken = await this.getAccessToken(config);
    const httpClient = axios.create({
      baseURL: `https://graph.microsoft.com/${version}`,
      timeout: 10000, // default is `0` (no timeout)
      maxContentLength: 50000, //default is 2000 bytes
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

  async *getUsers(): AsyncGenerator<User> {
    const res = await this.httpClient.get<UserResponse>('users');
    for (const item of res.data.value) {
      const extraUserInfo = await this.httpClient.get<UserExtraInfo>(
        `users/${item.id}?$select=Department,postalCode,createdDateTime,identities,streetAddress`
      );

      if (extraUserInfo.status === 200) {
        item.department = extraUserInfo.data.department;
        item.postalCode = extraUserInfo.data.postalCode;
        item.createdDateTime = extraUserInfo.data.createdDateTime;
        item.streetAddress = extraUserInfo.data.streetAddress;
        item.identities = extraUserInfo.data.identities;
      }

      try {
        const managerItem = await this.httpClient.get<User>(
          `users/${item.id}/manager`
        );
        if (managerItem.status === 200) {
          item.manager = managerItem.data.id;
        }
      } catch (error) {
        this.logger.error(error.toString());
      }
      yield item;
    }
  }

  async *getGroups(): AsyncGenerator<Group> {
    const res = await this.httpClient.get<GroupResponse>('groups');
    for (const item of res.data.value) {
      const memberItems = await this.httpClient.get<UserResponse>(
        `groups/${item.id}/members`
      );
      if (memberItems.status === 200) {
        const members: string[] = [];
        for (const memberItem of memberItems.data.value) {
          members.push(memberItem.id);
        }
        item.members = members;
      }
      const ownerItems = await this.httpClient.get<UserResponse>(
        `groups/${item.id}/owners`
      );
      if (ownerItems.status === 200) {
        const owners: string[] = [];
        for (const ownerItem of ownerItems.data.value) {
          owners.push(ownerItem.id);
        }
        item.owners = owners;
      }
      yield item;
    }
  }
}
