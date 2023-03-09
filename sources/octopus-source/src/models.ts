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
 * the ones that are missing are added here. Some are augmented with additional
 * information that is needed along with the result returned from Octopus.
 */
export type DeploymentResponse = OctopusDeployment;
export type DeploymentProcessResponse = OctopusDeploymentProcess;
export type DeploymentStepResponse = OctopusDeploymentStep;
export type DeploymentActionResponse = OctopusDeploymentAction;
export type Environment = DeploymentEnvironment;
export type PagedResponse<T> = AxiosResponse<ResourceCollection<T>>;
export type PagingParams = ListArgs;
export type Project = OctopusProject;
export type Space = OctopusSpace;
export type Task = ServerTask;

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

export interface DeploymentProcess {
  Steps: DeploymentStep[];
}

interface DeploymentStep {
  Name: string;
  Properties: ActionProperties;
  Actions: DeploymentAction[];
}

interface DeploymentAction {
  Name: string;
  Properties: ActionProperties;
}

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

export function cleanProcess(
  process: DeploymentProcessResponse
): DeploymentProcess {
  return {Steps: cleanSteps(process.Steps)};
}

function cleanSteps(steps: DeploymentStepResponse[]): DeploymentStep[] {
  const cleanSteps = [];
  for (const step of steps) {
    const cleanStep = {
      Name: step.Name,
      Properties: {},
      Actions: [],
    };

    if (step.Properties) {
      const cleanProperties = Object.entries(step.Properties).filter(([key]) =>
        nonOctopusProp(key)
      );
      for (const [key, val] of cleanProperties) {
        cleanStep.Properties[key] = val;
      }
    }

    for (const action of step.Actions) {
      cleanStep.Actions.push(cleanAction(action));
    }

    cleanSteps.push(cleanStep);
  }
  return cleanSteps;
}

function cleanAction(action: DeploymentActionResponse): DeploymentAction {
  const cleanAction = {
    Name: action.Name,
    Properties: {},
  };

  if (action.Properties) {
    const cleanProperties = Object.entries(action.Properties).filter(([key]) =>
      nonOctopusProp(key)
    );
    for (const [key, val] of cleanProperties) {
      cleanAction.Properties[key] = val;
    }
  }

  return cleanAction;
}

function nonOctopusProp(prop: string): boolean {
  return !new RegExp(/^Octopus.*$/).test(prop);
}
