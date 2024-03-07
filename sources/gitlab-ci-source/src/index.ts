import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Gitlab, GitlabConfig} from './gitlab';
import {Groups, Jobs, Pipelines, Projects} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new GitlabCiSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Example source implementation. */
export class GitlabCiSource extends AirbyteSourceBase<GitlabConfig> {
  get type(): string {
    return 'gitlabci';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: GitlabConfig): Promise<[boolean, VError]> {
    try {
      const gitlab = Gitlab.instance(config);
      await gitlab.checkConnection();
    } catch (error: any) {
      return [false, error];
    }
    return [true, undefined];
  }
  streams(config: GitlabConfig): AirbyteStreamBase[] {
    const gitlab = Gitlab.instance(config);
    const groups = new Groups(config, gitlab, this.logger);
    const projects = new Projects(config, gitlab, groups, this.logger);
    const pipelines = new Pipelines(config, gitlab, projects, this.logger);
    const jobs = new Jobs(config, gitlab, projects, pipelines, this.logger);

    return [groups, projects, pipelines, jobs];
  }
}
