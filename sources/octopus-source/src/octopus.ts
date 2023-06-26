import {AirbyteLogger} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';
import {VError} from 'verror';

import {Deployment, DeploymentProcess, Release} from './models';
import {OctopusClient} from './octopusClient';
import {DeploymentVariable} from './octopusModels';

export interface OctopusConfig {
  readonly api_key: string;
  readonly instance_url: string;
  readonly space_names?: string[];
  readonly variable_names?: string[];
  readonly fetch_deployment_process?: boolean;
  readonly cutoff_days?: number;
  readonly look_back_depth?: number;
  readonly page_size?: number;
  readonly max_retries?: number;
  readonly reject_unauthorized?: boolean;
}

/**
 * Contains the logic of the octopus source
 */
export class Octopus {
  private static inst: Octopus = null;
  private spaces: Record<string, string> = {};
  private cutoff?: DateTime;
  private variableNameSet: Set<string>;
  constructor(
    private readonly client: OctopusClient,
    private readonly logger: AirbyteLogger,
    cutoffDays?: number,
    variableNames: string[] = [],
    private readonly lookBackDepth = 10,
    private readonly fetchDeploymentProcess = false
  ) {
    this.cutoff = cutoffDays
      ? DateTime.now().minus({days: cutoffDays})
      : undefined;

    this.variableNameSet = new Set(variableNames);
  }

  static async instance(
    config: OctopusConfig,
    logger: AirbyteLogger
  ): Promise<Octopus> {
    if (Octopus.inst) return Octopus.inst;
    if (!config.api_key) {
      throw new VError('API Key must be provided');
    }
    if (!config.instance_url) {
      throw new VError('Instance URL must be provided');
    }
    if (config?.reject_unauthorized === false) {
      logger.warn('Disabling certificate validation');
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const client = new OctopusClient({
      instanceUrl: config.instance_url,
      apiKey: config.api_key,
      pageSize: config.page_size,
      maxRetries: config.max_retries,
    });

    Octopus.inst = new Octopus(
      client,
      logger,
      config.cutoff_days,
      config.variable_names,
      config.look_back_depth,
      config.fetch_deployment_process
    );
    await Octopus.inst.initialize(config.space_names);
    return Octopus.inst;
  }

  /**
   * Initialize by resolving provided Space names to ids.
   * If no spaceNames are provided, all spaces will be included.
   * @param spaceNames The Space names to resolve to ids
   */
  async initialize(spaceNames: string[] = []): Promise<void> {
    this.logger.debug('Initializing Octopus');

    const unresolvedNames =
      spaceNames.length > 0 ? new Set(spaceNames) : undefined;
    const resolvedNames = [];
    for await (const space of this.client.listSpaces()) {
      if (unresolvedNames?.has(space.Name)) {
        this.spaces[space.Id] = space.Name;
        resolvedNames.push(space.Name);
        unresolvedNames.delete(space.Name);
        if (unresolvedNames.size == 0) {
          break;
        }
      } else if (!unresolvedNames) {
        this.spaces[space.Id] = space.Name;
        resolvedNames.push(space.Name);
      }
    }
    if (unresolvedNames?.size > 0) {
      const unresolvedNamesStr = Array.from(unresolvedNames.values()).join(
        ', '
      );
      this.logger.warn(
        `The following spaces could not be resolved: ${unresolvedNamesStr}`
      );
    }
    if (resolvedNames.length > 0) {
      this.logger.info(
        `Octopus initialized to sync spaces: ${resolvedNames.join(', ')}`
      );
    }
    if (resolvedNames.length == 0) {
      this.logger.warn('No spaces could be resolved');
    }
  }

  async checkConnection(): Promise<void> {
    try {
      const iter = this.client.listSpaces();
      await iter.next();
    } catch (err: any) {
      throw new VError(err, 'Error verifying connection');
    }
  }

  async *getDeployments(
    checkpoints?: Record<string, {lastDeploymentId: string}>
  ): AsyncGenerator<Deployment> {
    for (const [spaceId, spaceName] of Object.entries(this.spaces)) {
      const since = checkpoints?.[spaceName]?.lastDeploymentId;
      let lookingBack = false;
      let lookedBack = 0;

      for await (const deployment of this.client.listDeployments(spaceId)) {
        if (this.cutoff && DateTime.fromISO(deployment.Created) < this.cutoff) {
          this.logger.info(
            `Cutoff reached for deployments in space: ${spaceName}`
          );
          break;
        }

        if (since && deployment.Id === since) {
          lookingBack = true;
        }
        if (lookingBack) {
          if (lookedBack >= this.lookBackDepth) {
            this.logger.info(
              `Including '${since}', looked back ${lookedBack} deployment(s) in space: ${spaceName}`
            );
            break;
          }
          lookedBack++;
        }

        const [project, environment, task, process, variables] =
          await Promise.all([
            this.client.getProject(deployment.ProjectId),
            this.client.getEnvironment(deployment.EnvironmentId),
            this.client.getTask(deployment.TaskId),
            this.getDeploymentProcess(
              deployment.ProjectId,
              deployment.DeploymentProcessId
            ),
            this.getDeploymentVariables(
              spaceId,
              deployment.ManifestVariableSetId
            ),
          ]);

        yield {
          ...deployment,
          SpaceName: spaceName,
          ProjectName: project.Name,
          EnvironmentName: environment.Name,
          Task: {
            State: task.State,
            ErrorMessage: task.ErrorMessage,
            QueueTime: task.QueueTime,
            StartTime: task.StartTime,
            CompletedTime: task.CompletedTime,
          },
          Process: process,
          Variables: variables,
        };
      }
    }
  }

  private async getDeploymentVariables(
    spaceId: string,
    variableSetId: string
  ): Promise<DeploymentVariable[] | undefined> {
    if (this.variableNameSet.size > 0) {
      const variables = await this.client.getVariableSet(
        spaceId,
        variableSetId
      );
      return variables?.filter((item) => this.variableNameSet.has(item.Name));
    }
  }

  private async getDeploymentProcess(
    projectId: string,
    deploymentProcessId: string
  ): Promise<DeploymentProcess | undefined> {
    let process: DeploymentProcess;
    if (this.fetchDeploymentProcess) {
      process = await this.client.getProjectDeploymentProcess(projectId);

      if (!process) {
        process = await this.client.getDeploymentProcess(deploymentProcessId);
      }
      if (!process) {
        this.logger.warn(`Unable to retrieve deployment process`);
      }
    }
    return process;
  }

  async *getReleases(
    checkpoints?: Record<string, {lastReleaseId: string}>
  ): AsyncGenerator<Release> {
    for (const [spaceId, spaceName] of Object.entries(this.spaces)) {
      const since = checkpoints?.[spaceName]?.lastReleaseId;
      let lookingBack = false;
      let lookedBack = 0;

      for await (const release of this.client.listReleases(spaceId)) {
        if (this.cutoff && DateTime.fromISO(release.Assembled) < this.cutoff) {
          this.logger.info(
            `Cutoff reached for releases in space: ${spaceName}`
          );
          break;
        }

        if (since && release.Id === since) {
          lookingBack = true;
        }
        if (lookingBack) {
          if (lookedBack >= this.lookBackDepth) {
            this.logger.info(
              `Including '${since}', looked back ${lookedBack} release(s) in space: ${spaceName}`
            );
            break;
          }
          lookedBack++;
        }

        const project = await this.client.getProject(release.ProjectId);

        yield {
          ...release,
          SpaceName: spaceName,
          ProjectName: project.Name,
        };
      }
    }
  }
}
