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
import {applyRoundRobinBucketing} from 'faros-airbyte-common/common';
import GlobToRegExp from 'glob-to-regexp';
import {toLower} from 'lodash';
import VError from 'verror';

import {CircleCI, CircleCIConfig} from './circleci/circleci';
import {Faros} from './faros/faros';
import {Pipelines, Projects, Tests, Usage} from './streams';
import {DEFAULT_RUN_MODE, RunMode, RunModeStreams} from './streams/common';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new CircleCISource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** CircleCI source implementation. */
export class CircleCISource extends AirbyteSourceBase<CircleCIConfig> {
  get type(): string {
    return 'circleci';
  }

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
    const streamNames = [
      ...RunModeStreams[config.run_mode ?? DEFAULT_RUN_MODE],
    ].filter(
      (streamName) =>
        config.run_mode !== RunMode.Custom ||
        !config.custom_streams?.length ||
        config.custom_streams.includes(streamName)
    );
    const streams = catalog.streams.filter((stream) =>
      streamNames.includes(stream.stream.name)
    );

    const circleCI = CircleCI.instance(config, this.logger);
    const projectSlugBlocklist = new Set(config.project_block_list ?? []);
    if (projectSlugBlocklist.has('*')) {
      throw new VError(
        'Global wildcard * is not supported in project blocklist'
      );
    }

    let excludedRepoSlugs: Set<string>;
    if (config.pull_blocklist_from_graph) {
      const faros = new Faros(
        {
          url: config.faros_api_url,
          apiKey: config.faros_api_key,
        },
        this.logger
      );
      const excludedRepos = await faros.getExcludedRepos(
        config.faros_graph_name
      );
      excludedRepoSlugs = new Set(
        excludedRepos.map((repo) => {
          const source = CircleCI.toVcsType(toLower(repo.organization.source));
          const orgUid = toLower(repo.organization.uid);
          const repoName = toLower(repo.name);
          return `${source}/${orgUid}/${repoName}`;
        })
      );
    }

    this.logger.debug(
      `Excluded repo slugs: ${Array.from(excludedRepoSlugs ?? new Set())}`
    );

    const allProjectSlugs: string[] = [];
    if (config.project_slugs.includes('*')) {
      const projects = await circleCI.getAllProjectSlugs();
      allProjectSlugs.push(...projects);
    } else {
      allProjectSlugs.push(...config.project_slugs);
    }

    config.project_slugs = CircleCISource.filterBlockList(
      allProjectSlugs,
      projectSlugBlocklist,
      excludedRepoSlugs
    );

    this.logger.info(
      `Will sync ${config.project_slugs.length} project slugs: ${config.project_slugs}`
    );

    const {config: newConfig, state: newState} = applyRoundRobinBucketing(
      config,
      state,
      this.logger.info.bind(this.logger)
    );

    return {
      config: newConfig as CircleCIConfig,
      catalog: {streams},
      state: newState,
    };
  }

  streams(config: CircleCIConfig): AirbyteStreamBase[] {
    return [
      new Projects(config, this.logger),
      new Pipelines(config, this.logger),
      new Tests(config, this.logger),
      new Usage(config, this.logger),
    ];
  }

  static filterBlockList(
    projectSlugs: ReadonlyArray<string>,
    projectSlugBlocklist: Set<string>,
    excludedRepoSlugs: Set<string>
  ): ReadonlyArray<string> {
    // Convert filter patterns to regular expressions
    const slugBlockListRegexes = Array.from(projectSlugBlocklist).map(
      (projectSlug) => GlobToRegExp(projectSlug, {flags: 'i'})
    );

    // Filter out directories that match any of the regex patterns
    return projectSlugs.filter(
      (slug) =>
        !slugBlockListRegexes.some((regex) => regex.test(slug)) &&
        !excludedRepoSlugs?.has(slug.toLowerCase())
    );
  }
}
