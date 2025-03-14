import {AxiosInstance} from 'axios';
import {ICoreApi} from 'azure-devops-node-api/CoreApi';
import {IGitApi} from 'azure-devops-node-api/GitApi';
import {IdentityRef} from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import {GraphUser} from 'azure-devops-node-api/interfaces/GraphInterfaces';
import {IWorkItemTrackingApi} from 'azure-devops-node-api/WorkItemTrackingApi';

export type DevOpsCloud = {
  type: 'cloud';
};
export type DevOpsServer = {
  type: 'server';
  api_url: string;
};
export type AzureDevOpsInstance = DevOpsCloud | DevOpsServer;

export interface AzureDevOpsConfig {
  readonly instance?: AzureDevOpsInstance;
  readonly access_token: string;
  readonly organization: string;
  readonly projects?: ReadonlyArray<string>;
  readonly cutoff_days?: number;
  readonly page_size?: number;
  readonly max_retries?: number;
  readonly request_timeout?: number;
}

export interface AzureDevOpsClient {
  readonly core: ICoreApi;
  readonly git: IGitApi;
  readonly wit: IWorkItemTrackingApi;
  readonly graph?: AxiosInstance;
}

export type User = GraphUser | IdentityRef;

export interface GraphUserResponse {
  count: number;
  value: GraphUser[];
}
