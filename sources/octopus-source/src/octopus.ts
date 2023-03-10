import {AirbyteLogger} from 'faros-airbyte-cdk';
import {VError} from 'verror';

import {Deployment, Release} from './models';
import {OctopusClient} from './octopusClient';

export interface OctopusConfig {
  readonly api_key: string;
  readonly instance_url: string;
  readonly space_names?: string[];
  readonly page_size?: number;
  readonly max_retries?: number;
}

/**
 * Contains the logic of the octopus source
 */
export class Octopus {
  private static inst: Octopus = null;
  private spaces: Record<string, string> = {};

  constructor(
    private readonly client: OctopusClient,
    private readonly logger: AirbyteLogger
  ) {}

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

    const client = new OctopusClient({
      instanceUrl: config.instance_url,
      apiKey: config.api_key,
      pageSize: config.page_size,
      maxRetries: config.max_retries,
    });

    Octopus.inst = new Octopus(client, logger);
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

  async *getDeployments(): AsyncGenerator<Deployment> {
    for (const [spaceId, spaceName] of Object.entries(this.spaces)) {
      for await (const deployment of this.client.listDeployments(spaceId)) {
        const [project, environment, task, process] = await Promise.all([
          this.client.getProject(deployment.ProjectId),
          this.client.getEnvironment(deployment.EnvironmentId),
          this.client.getTask(deployment.TaskId),
          this.client.getProjectDeploymentProcess(deployment.ProjectId),
        ]);

        yield {
          ...deployment,
          _extra: {
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
          },
        };
      }
    }
  }

  async *getReleases(): AsyncGenerator<Release> {
    for (const [spaceId, spaceName] of Object.entries(this.spaces)) {
      for await (const release of this.client.listReleases(spaceId)) {
        const project = await this.client.getProject(release.ProjectId);
        yield {
          ...release,
          _extra: {
            SpaceName: spaceName,
            ProjectName: project.Name,
          },
        };
      }
    }
  }
}
