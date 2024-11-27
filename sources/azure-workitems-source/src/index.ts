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

import {AzureWorkitems, AzureWorkitemsConfig} from './azure-workitems';
import {Boards, Iterations, Users} from './streams';
import {Workitems} from './streams/workitems';

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
      const azureActiveDirectory = await AzureWorkitems.instance(
        config,
        this.logger
      );
      await azureActiveDirectory.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: AzureWorkitemsConfig): AirbyteStreamBase[] {
    return [
      new Workitems(config, this.logger),
      new Users(config, this.logger),
      new Iterations(config, this.logger),
      new Boards(config, this.logger),
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
    let configProjects: string[] = [];

    // Warn if both config options are used
    if (config.projects?.length && config.project) {
      this.logger.warn(
        'Both projects and project provided, discarding project.'
      );
    }
    if (config.projects?.length) {
      configProjects = config.projects.includes('*')
        ? []
        : [...config.projects];
    } else if (config.project) {
      configProjects = [config.project];
    }

    return {config: {...config, projects: configProjects}, catalog, state};
  }
}
