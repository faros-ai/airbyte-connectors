import {Command} from 'commander';
import {
  AirbyteConfiguredCatalog,
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteState,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {CircleCI, CircleCIConfig} from './circleci/circleci';
import {Pipelines, Projects, Tests} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new CircleCISource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Customer.io source implementation. */
export class CircleCISource extends AirbyteSourceBase<CircleCIConfig> {
  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: CircleCIConfig): Promise<[boolean, VError]> {
    try {
      const circleCI = CircleCI.instance(config, this.logger);
      await circleCI.checkConnection(config);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  async onBeforeRead(
    config: CircleCIConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: CircleCIConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    // We update the config with the projects - the blocklist
    //const circleCI = CircleCI.instance(config, this.logger)
    const axiosV2Instance = CircleCI.getAxiosInstance(config, this.logger);
    const org_slug: string = await CircleCI.getOrgSlug(
      axiosV2Instance,
      this.logger
    );
    const filtered_project_names: string[] =
      await CircleCI.updateProjectNamesWithBlocklist(
        config,
        this.logger,
        org_slug
      );
    config.filtered_project_names = filtered_project_names;
    return {config, catalog, state};
  }

  streams(config: CircleCIConfig): AirbyteStreamBase[] {
    const circleCI = CircleCI.instance(config, this.logger);
    return [
      new Projects(circleCI, config, this.logger),
      new Pipelines(circleCI, config, this.logger),
      new Tests(circleCI, config, this.logger),
    ];
  }
}
