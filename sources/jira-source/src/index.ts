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
import {FarosClient} from 'faros-js-client';
import VError from 'verror';

import {Jira, JiraConfig} from './jira';
import {RunMode, WebhookSupplementStreamNames} from './streams/common';
import {FarosBoardIssues} from './streams/faros_board_issues';
import {FarosIssuePullRequests} from './streams/faros_issue_pull_requests';
import {FarosSprintReports} from './streams/faros_sprint_reports';
import {FarosSprints} from './streams/faros_sprints';

const DEFAULT_API_URL = 'https://prod.api.faros.ai';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new JiraSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Example source implementation. */
export class JiraSource extends AirbyteSourceBase<JiraConfig> {
  get type(): string {
    return 'jira';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: JiraConfig): Promise<[boolean, VError]> {
    try {
      await Jira.instance(config, this.logger);
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  makeFarosClient(config: JiraConfig): FarosClient {
    return new FarosClient({
      url: config.api_url ?? DEFAULT_API_URL,
      apiKey: config.api_key,
      useGraphQLV2: true,
    });
  }

  streams(config: JiraConfig): AirbyteStreamBase[] {
    let farosClient;
    if (config.api_key && config.api_url) {
      farosClient = this.makeFarosClient(config);
    }
    return [
      new FarosIssuePullRequests(config, this.logger, farosClient),
      new FarosSprintReports(config, this.logger, farosClient),
      new FarosBoardIssues(config, this.logger, farosClient),
      new FarosSprints(config, this.logger),
    ];
  }

  async onBeforeRead(
    config: JiraConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): Promise<{
    config: JiraConfig;
    catalog: AirbyteConfiguredCatalog;
    state?: AirbyteState;
  }> {
    let streams = catalog.streams;
    if (config.run_mode === RunMode.WebhookSupplement) {
      streams = streams.filter((stream) =>
        WebhookSupplementStreamNames.includes(stream.stream.name)
      );
    }
    return {config, catalog: {streams}, state};
  }
}
