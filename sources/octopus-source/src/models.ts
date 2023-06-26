import {AxiosResponse} from 'axios';

import {
  ActionProperties,
  Deployment as OctopusDeployment,
  DeploymentAction as OctopusDeploymentAction,
  DeploymentProcess as OctopusDeploymentProcess,
  DeploymentStep as OctopusDeploymentStep,
  DeploymentVariable,
  ListArgs,
  Release as OctopusRelease,
  ResourceCollection,
  TaskState,
} from './octopusModels';

export type PagedResponse<T> = AxiosResponse<ResourceCollection<T>>;
export type PagingParams = ListArgs;

export interface Deployment extends OctopusDeployment {
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
  readonly Process?: DeploymentProcess;
  readonly Variables?: DeploymentVariable[];
}

export interface Release extends OctopusRelease {
  readonly SpaceName: string;
  readonly ProjectName: string;
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

export function cleanProcess(
  process: OctopusDeploymentProcess
): DeploymentProcess {
  return {Steps: cleanSteps(process.Steps)};
}

function cleanSteps(steps: OctopusDeploymentStep[]): DeploymentStep[] {
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

function cleanAction(action: OctopusDeploymentAction): DeploymentAction {
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
