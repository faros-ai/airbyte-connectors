import {
  Deployment as OctopusDeployment,
  DeploymentEnvironment,
  ListArgs,
  Project as OctopusProject,
  ResourceCollection,
  Space as OctopusSpace,
} from '@octopusdeploy/api-client';
import {AxiosResponse} from 'axios';

/**
 * Only some of the needed models are available from the Octopus api-client,
 * the ones that are missing are added here.
 */

export type Space = OctopusSpace;

export type Project = OctopusProject;

export type DeploymentResponse = OctopusDeployment;

export interface Deployment extends OctopusDeployment {
  readonly SpaceName: string;
  readonly ProjectName: string;
  readonly EnvironmentName: string;
}

export interface Artifact {
  readonly Id: number;
}

export type Environment = DeploymentEnvironment;

export interface Release {
  readonly Id: string;
  readonly ProjectId: string;
  readonly SpaceId: string;
  readonly ChannelId: string;
  readonly Version: string;
  readonly ReleaseNotes: string;
  readonly ProjectDeploymentProcessSnapshotId: boolean;
  readonly IgnoreChannelRules: boolean;
  readonly BuildInformation: object;
  readonly Assembled: boolean;
  readonly LibraryVariableSetSnapshotIds: object;
  readonly SelectedPackages: object;
  readonly ProjectVariableSetSnapshotId: object;
  readonly VersionControlReference: object;
  readonly LastModifiedBy: object;
  readonly LastModifiedOn: object;
  readonly Link: object;
  readonly SpaceName: string;
  readonly ProjectName: string;
}

export type PagedResponse<T> = AxiosResponse<ResourceCollection<T>>;
export type PagingParams = ListArgs;
