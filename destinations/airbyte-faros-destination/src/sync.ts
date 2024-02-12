import {AxiosRequestConfig} from 'axios';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {FarosClient, FarosClientConfig} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';
import VError from 'verror';

export interface SyncMessage {
  summary: string;
  code: number;
  action: string;
  entity?: string;
  details?: any;
  messages?: SyncMessage[];
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
    startedAt: Date
  ): Promise<AccountSync | undefined> {
    return syncResult(
      await this.attemptRequest(
        this.request('PUT', `/accounts/${accountId}/syncs`, {
          startedAt: startedAt.toISOString(),
        }),
        `Failed to create sync for account ${accountId}`
      )
    );
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

  private attemptRequest<T>(f: Promise<T>, failureMessage: string): Promise<T> {
    return f.catch((error) => {
      this.airbyteLogger?.warn(failureMessage);
      this.airbyteLogger?.traceError(error);
      return undefined;
    });
  }
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
