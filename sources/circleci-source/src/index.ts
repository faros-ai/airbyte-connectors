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
import {Project} from './circleci/types';
import {ExcludedRepos, Faros} from './faros/faros';
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
    const circleCI = CircleCI.instance(config, this.logger);
    const faros = new Faros(
      {
        url: config.faros_api_url,
        apiKey: config.faros_api_key,
        useGraphQLV2: true,
      },
      this.logger
    );

    let excludedRepos: ExcludedRepos;
    if (config.pull_blocklist_from_graph) {
      excludedRepos = await faros.getExcludedRepos(config.faros_graph_name);
    }

    const allProjects: Project[] = [];
    if (config.project_slugs.includes('*')) {
      const projects = await circleCI.getAllProjects();
      allProjects.push(...projects);
    } else {
      for (const projectSlug of config.project_slugs) {
        allProjects.push(await circleCI.fetchProject(projectSlug));
      }
    }

    config.project_slugs = allProjects
      .filter((project) => {
        let shouldInclude = true;
        if (config.project_blocklist?.includes(project.slug)) {
          shouldInclude = false;
        }
        if (excludedRepos) {
          const vcsProvider = project.vcs_info.provider.toLowerCase();
          const org = project.organization_name.toLowerCase();
          const repo = project.name.toLowerCase();
          if (excludedRepos[vcsProvider]?.[org]?.has(repo)) {
            shouldInclude = false;
          }
        }
        if (!shouldInclude) {
          this.logger.warn(`Excluding project ${project.slug}`);
        }
        return shouldInclude;
      })
      .map((project) => project.slug);

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
