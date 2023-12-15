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
import {CircleCIOnReadInfo} from './circleci/typings';
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
    // There are 4 booleans to consider:
    // 1. slugs_as_repos
    // 2. project_names includes *
    // 3. project_blocklist is provided
    // 4. Github/Gitlab is used for the project names
    // We want to be able to handle all combinations of these booleans.

    // First, we consider the simplest case - the user provides the entirety of the project names,
    // and does not provide a block list. This is the noChangeCase.
    // We do not need to do any processing on the project names in this case.
    // We also do not need to do any processing on the blocklist in this case.

    // In all the below cases, we need to get basic information from CircleCI, in which case
    // we run the getBasicInfo function. This function gets the org slug, the repo names,
    // the boolean 'github/gitlab usage', and the project ids, as well as organization ids.

    // Second, we consider the special case where the user wants to pull all projects and
    // pull a blocklist from the graph. Whenever the user wants to pull a blocklist from the graph,
    // we use this special case.

    // Third, we consider the case where the user wants to pull all projects and provides a block list
    // of repo names to ignore.
    // Fourth, we consider the case where the user wants to pull all projects and provides a block list
    // of complete projects to ignore.

    if (CircleCI.isNoChangeCase(config)) {
      this.logger.info(
        'No change applied to input project names: ' + config.project_names
      );
      config.filtered_project_names = Array.from(config.project_names);
      return {config, catalog, state};
    }
    const cci: CircleCIOnReadInfo = await CircleCI.getBasicInfo(
      config,
      this.logger
    );

    if (config.pull_blocklist_from_graph) {
      config.filtered_project_names =
        await CircleCI.getProjectsWhilePullingBlocklistFromGraph(
          cci,
          config,
          this.logger
        );
      return {config, catalog, state};
    }

    // Setting up blocklist
    const blocklist: string[] = config.project_blocklist
      ? config.project_blocklist
      : [];
    const wildCardProjects = config.project_names.includes('*');
    let filtered_project_names: string[] = [];
    if (wildCardProjects) {
      if (config.slugs_as_repos) {
        const filtered_repo_names = CircleCI.filterOnBlocklist(
          cci.repoNames,
          blocklist,
          this.logger
        );
        filtered_project_names = CircleCI.getCompleteProjectNamesFromRepoNames(
          this.logger,
          filtered_repo_names,
          cci
        );
      } else {
        const projectNames = CircleCI.getCompleteProjectNamesFromRepoNames(
          this.logger,
          cci.repoNames,
          cci
        );
        filtered_project_names = CircleCI.filterOnBlocklist(
          projectNames,
          blocklist,
          this.logger
        );
      }
    } else if (config.slugs_as_repos) {
      filtered_project_names = CircleCI.getCompleteProjectNamesFromRepoNames(
        this.logger,
        config.project_names,
        cci
      );
    } else {
      throw new Error('Input config case not covered. Please contact support.');
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
