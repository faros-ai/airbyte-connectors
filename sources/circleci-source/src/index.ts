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
      await circleCI.checkConnection();
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
    // Within this function we redefine what the project names are based on the config inputs.
    // If they are providing the entire project names, we use that.
    // If they want to pull all projects and use a blocklist to ignore certain projects,
    // we pull all projects and then filter out the blocklist.
    // We also want to be able to handle inputs that are given as repo names instead of project names.
    // In that case, we need to be able to convert repo names into project names.
    // In the case that they want to pull the blocklist from the graph, we assume slugs_as_repos is true.
    // This is because the blocklist is pulled from the graph using the repo name, not the project name.
    let blocklist: string[] = config.project_blocklist
      ? config.project_blocklist
      : [];
    if (config.pull_blocklist_from_graph) {
      blocklist = await CircleCI.pullProjectsBlocklistFromGraph(
        config,
        this.logger
      );
    }
    let filtered_project_names: string[] = [];
    if (config.slugs_as_repos) {
      filtered_project_names = await CircleCI.getFilteredProjectsFromRepoNames(
        config,
        this.logger,
        blocklist
      );
    } else {
      filtered_project_names = await CircleCI.getFilteredProjects(
        config,
        this.logger,
        blocklist
      );
    }

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
