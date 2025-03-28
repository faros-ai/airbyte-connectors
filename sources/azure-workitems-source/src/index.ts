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
import VError from 'verror';

import {AzureWorkitems} from './azure-workitems';
import {AzureWorkitemsConfig} from './models';
import {Iterations, Projects, Users, Workitems} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new AzureWorkitemsSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Example source implementation. */
export class AzureWorkitemsSource extends AirbyteSourceBase<AzureWorkitemsConfig> {
  get type(): string {
    return 'azure-workitems';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(
    config: AzureWorkitemsConfig
  ): Promise<[boolean, VError]> {
    try {
      const azureWorkItems = await AzureWorkitems.instance(config, this.logger);
      await azureWorkItems.checkConnection(config.projects);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AzureWorkitemsConfig): AirbyteStreamBase[] {
    return [
      new Projects(config, this.logger),
      new Workitems(config, this.logger),
      new Users(config, this.logger),
      new Iterations(config, this.logger),
    ];
  }
  async onBeforeRead(
    config: AzureWorkitemsConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: AzureWorkitemsConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    let projects: string[] = [];
    const {projects: configProjects, project} = config;

    // Warn if both config options are used
    if (configProjects?.length && project) {
      this.logger.warn(
        'Both projects and project provided, project value will be ignored.'
      );
    }

    if (configProjects?.length) {
      const filteredProjects = [...configProjects]
        .filter(Boolean)
        .map((p) => p.trim());
      projects = filteredProjects.includes('*') ? [] : filteredProjects;
    } else if (project) {
      projects = [project.trim()];
    }

    return {config: {...config, projects}, catalog, state};
  }
}
