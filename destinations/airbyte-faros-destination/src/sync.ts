import {AxiosRequestConfig} from 'axios';
import {AirbyteConfig, AirbyteLogger, SyncMessage} from 'faros-airbyte-cdk';
import {FarosClient, FarosClientConfig} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

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
  errors?: SyncMessage[];
  metrics?: Dictionary<any>;
}

export type UpdateAccountSyncProps = Omit<
  AccountSync,
  'syncId' | 'logId' | 'startedAt'
>;

interface AccountSyncResponse {
  sync: AccountSync;
}

const DEFAULT_TYPE = 'custom';

class FarosSyncClient extends FarosClient {
  constructor(
    cfg: FarosClientConfig,
    private readonly airbyteLogger?: AirbyteLogger,
    axiosConfig?: AxiosRequestConfig
  ) {
    super(cfg, airbyteLogger?.asPino('info'), axiosConfig);
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
    type?: string
  ): Promise<Account | undefined> {
    this.logger?.info(`Creating local account ${accountId}`);
    return accountResult(
      await this.attemptRequest<AccountResponse>(
        this.request('POST', '/accounts', {
          accountId,
          params: {...redactedConfig, graphName, graphql_api: 'v2'},
          type: type ?? DEFAULT_TYPE,
          local: true,
        }),
        `Failed to create account ${accountId}`
      )
    );
  }

  async updateLocalAccount(
    accountId: string,
    graphName: string,
    redactedConfig,
    type?: string
  ): Promise<Account | undefined> {
    this.logger?.info(`Updating local account ${accountId}`);
    return accountResult(
      await this.attemptRequest<AccountResponse>(
        this.request('PUT', `/accounts/${accountId}`, {
          params: {...redactedConfig, graphName, graphql_api: 'v2'},
          type: type ?? DEFAULT_TYPE,
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
          warnings: props.warnings ?? [],
          errors: props.errors ?? [],
          metrics: props.metrics ?? {},
        }),
        `Failed to update sync ${syncId} for account ${accountId}`
      )
    );
  }

  private attemptRequest<T>(
    f: Promise<T>,
    failureMessage?: string
  ): Promise<T | undefined> {
    return f.catch((error) => {
      if (failureMessage) {
        this.airbyteLogger?.warn(failureMessage);
        this.airbyteLogger?.traceError(error);
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

export default FarosSyncClient;
