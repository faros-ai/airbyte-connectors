import {AxiosRequestConfig, AxiosResponse} from 'axios';
import {AirbyteConfig, AirbyteLogger, SyncMessage} from 'faros-airbyte-cdk';
import {
  FarosClient,
  FarosClientConfig,
  makeAxiosInstanceWithRetry,
} from 'faros-js-client';
import {DEFAULT_AXIOS_CONFIG} from 'faros-js-client/lib/client';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {LogContent} from './destination-logger';

export interface Account {
  accountId: string;
  params: Dictionary<any>;
  type: string;
  local: boolean;
}

interface AccountResponse {
  account: Account;
}

export interface AccountSync {
  syncId: string;
  logId: string;
  startedAt: Date;
  endedAt?: Date;
  status: 'error' | 'running' | 'success' | 'unknown';
  warnings?: SyncMessage[];
  errors?: SyncMessage[]; // can be non-empty and status = 'success', a.k.a. "partial success"
  metrics?: Dictionary<any>;
}

export type UpdateAccountSyncProps = Omit<
  AccountSync,
  'syncId' | 'logId' | 'startedAt'
>;

interface AccountSyncResponse {
  sync: AccountSync;
}

const DEFAULT_ACCOUNT_TYPE = 'custom';

class FarosSyncClient extends FarosClient {
  constructor(
    cfg: FarosClientConfig,
    private readonly airbyteLogger?: AirbyteLogger,
    private readonly _axiosConfig?: AxiosRequestConfig
  ) {
    super(cfg, airbyteLogger?.asPino('info'), _axiosConfig);
  }

  async createAccountSync(
    accountId: string,
    startedAt: Date,
    logId?: string
  ): Promise<AccountSync | undefined> {
    const sync = syncResult(
      await this.attemptRequest(
        this.request('PUT', `/accounts/${accountId}/syncs`, {
          startedAt: startedAt.toISOString(),
          logId,
        }),
        `Failed to create sync for account ${accountId}`
      )
    );
    if (sync) {
      this.airbyteLogger?.info(`Created sync id: ${sync?.syncId}`);
    }
    return sync;
  }

  async createLocalAccount(
    accountId: string,
    graphName: string,
    redactedConfig: AirbyteConfig,
    type?: string,
    mode?: string
  ): Promise<Account | undefined> {
    this.airbyteLogger?.debug(`Creating local account ${accountId}`);
    return accountResult(
      await this.attemptRequest<AccountResponse>(
        this.request('POST', '/accounts', {
          accountId,
          params: {...redactedConfig, graphName},
          type: type ?? DEFAULT_ACCOUNT_TYPE,
          mode,
          local: true,
        }),
        `Failed to create account ${accountId}`
      )
    );
  }

  async updateLocalAccount(
    accountId: string,
    graphName: string,
    redactedConfig: AirbyteConfig,
    type?: string,
    mode?: string
  ): Promise<Account | undefined> {
    this.airbyteLogger?.debug(`Updating local account ${accountId}`);
    return accountResult(
      await this.attemptRequest<AccountResponse>(
        this.request('PUT', `/accounts/${accountId}`, {
          params: {...redactedConfig, graphName, graphql_api: 'v2'},
          type: type ?? DEFAULT_ACCOUNT_TYPE,
          mode,
          local: true,
        }),
        `Failed to update account ${accountId}`
      )
    );
  }

  async getAccount(accountId: string): Promise<Account | undefined> {
    return accountResult(
      await this.attemptRequest(this.request('GET', `/accounts/${accountId}`))
    );
  }

  async getOrCreateAccount(
    accountId: string,
    graphName: string,
    redactedConfig: AirbyteConfig
  ) {
    const account = await this.getAccount(accountId);
    if (account) {
      return account;
    }
    return this.createLocalAccount(accountId, graphName, redactedConfig);
  }

  async updateAccountSync(
    accountId: string,
    syncId: string,
    props: UpdateAccountSyncProps
  ): Promise<AccountSync | undefined> {
    return syncResult(
      await this.attemptRequest(
        this.request('PATCH', `/accounts/${accountId}/syncs/${syncId}`, {
          ...props,
          endedAt: props.endedAt?.toISOString(),
          warnings: props.warnings?.map(cleanSyncMessage) ?? [],
          errors: props.errors?.map(cleanSyncMessage) ?? [],
          metrics: props.metrics ?? {},
        }),
        `Failed to update sync ${syncId} for account ${accountId}`
      )
    );
  }

  async getAccountSyncLogFileUrl(
    accountId: string,
    syncId: string,
    hash: string
  ): Promise<string | undefined> {
    const result: {uploadUrl: string} = await this.attemptRequest(
      this.request('POST', `/accounts/${accountId}/syncs/${syncId}/logs`, {
        hash,
      }),
      `Failed to generate log file url for sync ${syncId} for account ${accountId}`
    );
    return result?.uploadUrl;
  }

  async uploadLogs(
    accountId: string,
    syncId: string,
    logs: LogContent,
    skipVerify?: boolean
  ): Promise<void> {
    this.airbyteLogger?.debug(
      'Uploading sync logs' +
        (skipVerify ? ' (skipping hash verification)' : '')
    );
    const urlResp: {uploadUrl: string} = await this.attemptRequest(
      this.request('POST', `/accounts/${accountId}/syncs/${syncId}/logs`, {
        hash: skipVerify ? undefined : logs.hash,
      }),
      `Failed to generate log file url for sync ${syncId} for account ${accountId}`
    );
    if (!urlResp?.uploadUrl) {
      return;
    }
    const api = makeAxiosInstanceWithRetry(
      this._axiosConfig ?? DEFAULT_AXIOS_CONFIG,
      this.logger
    );
    const uploadResp = await this.attemptRequest(
      api.put(urlResp.uploadUrl, logs.content, {
        headers: {
          'content-length': logs.content.length,
          'content-md5': skipVerify ? undefined : logs.hash,
          'content-type': 'text/plain; charset=UTF-8',
        },
      }),
      'Failed to upload sync logs'
    );
    if (!uploadResp && !skipVerify) {
      await this.uploadLogs(accountId, syncId, logs, true);
    }
    this.airbyteLogger?.debug('Finished uploading sync logs');
  }

  private attemptRequest<T>(
    f: Promise<T>,
    failureMessage?: string
  ): Promise<T | undefined> {
    return f.catch((error) => {
      if (failureMessage) {
        let message = `Error: ${error?.message ?? JSON.stringify(error)}`;
        const response = VError.info(error)?.res?.data;
        if (response) {
          message += `. Response: ${JSON.stringify(response)}`;
        }
        this.airbyteLogger?.warn(`${failureMessage}. ${message}`);
        if (isAxiosResponse(error.response)) {
          const response = error.response as AxiosResponse;
          this.airbyteLogger?.warn(
            `Error response code: ${response.status}. Body: ${response.data}`
          );
        }
      }
      return undefined;
    });
  }
}

function accountResult(response?: AccountResponse): Account | undefined {
  return response?.account;
}

function syncResult(response?: AccountSyncResponse): AccountSync | undefined {
  if (!response?.sync) {
    return undefined;
  }
  return {
    ...response.sync,
    startedAt: new Date(response.sync.startedAt),
    endedAt: response.sync.endedAt
      ? new Date(response.sync.endedAt)
      : undefined,
  };
}

type CleanedSyncMessage = Omit<SyncMessage, 'type'>;

function cleanSyncMessage(m: SyncMessage): CleanedSyncMessage {
  const {type, ...rest} = m;
  return rest;
}

function isAxiosResponse(object: any): object is AxiosResponse {
  return object && object.status && typeof object.status === 'number';
}

export default FarosSyncClient;
