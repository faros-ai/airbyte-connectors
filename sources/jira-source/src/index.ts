import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Jira, JiraConfig} from './jira';
import {FarosBoardIssues} from './streams/faros_board_issues';
import {FarosIssuePullRequests} from './streams/faros_issue_pull_requests';
import {FarosSprintReports} from './streams/faros_sprint_reports';

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
  streams(config: JiraConfig): AirbyteStreamBase[] {
    return [
      new FarosIssuePullRequests(config, this.logger),
      new FarosSprintReports(config, this.logger),
      new FarosBoardIssues(config, this.logger),
    ];
  }
}
