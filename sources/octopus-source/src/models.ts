import {
  ActionProperties,
  Deployment as OctopusDeployment,
  DeploymentAction as OctopusDeploymentAction,
  DeploymentEnvironment,
  DeploymentProcess as OctopusDeploymentProcess,
  DeploymentStep as OctopusDeploymentStep,
  ListArgs,
  Project as OctopusProject,
  ResourceCollection,
  ServerTask,
  Space as OctopusSpace,
  TaskState,
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
  readonly _extra: {
    readonly SpaceName: string;
    readonly ProjectName: string;
    readonly EnvironmentName: string;
    readonly Task: {
      readonly State: TaskState;
      readonly ErrorMessage: string;
      readonly QueueTime: string;
      readonly StartTime: string;
      readonly CompletedTime: string;
    };
    readonly Process: DeploymentProcess;
  };
}

export type DeploymentProcessResponse = OctopusDeploymentProcess;
export type DeploymentStepResponse = OctopusDeploymentStep;
export type DeploymentActionResponse = OctopusDeploymentAction;

export interface DeploymentProcess {
  Steps: DeploymentStep[];
}

export interface DeploymentStep {
  Name: string;
  Properties: ActionProperties;
  Actions: DeploymentAction[];
}

export interface DeploymentAction {
  Name: string;
  Properties: ActionProperties;
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
  readonly _extra: {
    readonly SpaceName: string;
    readonly ProjectName: string;
  };
}

export type Task = ServerTask;

export type PagedResponse<T> = AxiosResponse<ResourceCollection<T>>;
export type PagingParams = ListArgs;
