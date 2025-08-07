import {Command} from 'commander';
import {
  AirbyteConfiguredCatalog,
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteState,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import {calculateDateRange} from 'faros-airbyte-common/common';
import {VError} from 'verror';

import {GerritClient} from './gerrit';
import {FarosChanges} from './streams/faros_changes';
import {FarosProjects} from './streams/faros_projects';
import {FarosUsers} from './streams/faros_users';
import {GerritConfig} from './types';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GerritSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class GerritSource extends AirbyteSourceBase<GerritConfig> {
  get type(): string {
    return 'gerrit';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: GerritConfig): Promise<[boolean, any]> {
    try {
      const client = new GerritClient(config, this.logger);
      await client.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: GerritConfig): AirbyteStreamBase[] {
    return [
      new FarosProjects(config, this.logger),
      new FarosChanges(config, this.logger),
      new FarosUsers(config, this.logger),
    ];
  }

  async onBeforeRead(
    config: GerritConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: GerritConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    // Calculate date range for incremental sync
    const {startDate, endDate} = calculateDateRange({
      start_date: config.start_date,
      end_date: config.end_date,
      cutoff_days: config.cutoff_days,
      logger: this.logger.info.bind(this.logger),
    });

    // Filter projects if specified
    let projectsToSync: string[] | undefined;
    if (config.projects?.length || config.excluded_projects?.length) {
      const client = new GerritClient(config, this.logger);
      const allProjects = new Set<string>();
      
      // Fetch all visible projects
      for await (const projectBatch of client.listProjects()) {
        for (const project of projectBatch) {
          allProjects.add(project.name);
        }
      }

      // Apply inclusion/exclusion filters
      const includedProjects = config.projects?.length 
        ? new Set(config.projects)
        : allProjects;
      
      const excludedProjects = new Set(config.excluded_projects || []);
      
      projectsToSync = [...includedProjects].filter(
        project => !excludedProjects.has(project)
      );

      if (projectsToSync.length === 0) {
        throw new VError(
          'No projects remain after applying inclusion and exclusion filters'
        );
      }

      this.logger.info(`Will sync ${projectsToSync.length} projects`);
    }

    return {
      config: {
        ...config,
        startDate,
        endDate,
        projects: projectsToSync,
        excluded_projects: undefined,
      },
      catalog,
      state,
    };
  }
}