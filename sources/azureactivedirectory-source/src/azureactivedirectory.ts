import axios, {AxiosInstance} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {wrapApiError} from 'faros-feeds-sdk';
import {VError} from 'verror';
const FormData = require('form-data');

import {
  Group,
  GroupResponse,
  User,
  UserDepartment,
  UserResponse,
} from './models';

const DEFAULT_AUTH_VERSION = 'v2.0';
const DEFAULT_VERSION = 'v1.0';
const AUTH_URL = 'https://login.microsoftonline.com';

export interface AzureActiveDirectoryConfig {
  readonly client_id: string;
  readonly client_secret: string;
  readonly namespace: string;
  readonly auth_version?: string;
  readonly version?: string;
}

export class AzureActiveDirectory {
  private static azureActiveDirectory: AzureActiveDirectory = null;

  constructor(private readonly httpClient: AxiosInstance) {}

  static async init(
    config: AzureActiveDirectoryConfig
  ): Promise<AzureActiveDirectory> {
    if (!config.client_id) {
      throw new VError('client_id must be a not empty string');
    }

    if (!config.client_secret) {
      throw new VError('client_secret must be a not empty string');
    }

    const version = config.version ? config.version : DEFAULT_VERSION;
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
      httpClient
    );
    return AzureActiveDirectory.azureActiveDirectory;
  }

  static async instance(): Promise<AzureActiveDirectory> {
    return AzureActiveDirectory.azureActiveDirectory;
  }

  private static async getAccessToken(
    config: AzureActiveDirectoryConfig
  ): Promise<string> {
    const request = require('request');
    const version = config.auth_version
      ? config.auth_version
      : DEFAULT_AUTH_VERSION;
    return new Promise(function (resolve, reject) {
      request(
        {
          method: 'POST',
          url: `${AUTH_URL}/${config.namespace}/oauth2/${version}/token`,
          formData: {
            client_id: config.client_id,
            scope: 'https://graph.microsoft.com/.default',
            client_secret: config.client_secret,
            grant_type: 'client_credentials',
          },
        },
        function (error, res, body) {
          if (!error && res.statusCode == 200) {
            resolve(JSON.parse(body).access_token);
          } else {
            reject(error);
          }
        }
      );
    });
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
      const departmentItem = await this.httpClient.get<UserDepartment>(
        `users/${item.id}?$select=Department,postalCode`
      );
      item.department = departmentItem.data.department;
      item.postalCode = departmentItem.data.postalCode;
      try {
        const managerItem = await this.httpClient.get<User>(
          `users/${item.id}/manager`
        );
        if (managerItem.status === 200) {
          item.manager = managerItem.data;
        }
      } catch (error) {
        console.error(error);
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
      item.members = memberItems.data.value;
      const ownerItems = await this.httpClient.get<UserResponse>(
        `groups/${item.id}/owners`
      );
      item.owners = ownerItems.data.value;
      yield item;
    }
  }
}
