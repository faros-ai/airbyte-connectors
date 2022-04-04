import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Gitlab, GitlabConfig} from './gitlab';
import {Group, Jobs, Pipelines, Projects} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new GitlabCiSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Example source implementation. */
export class GitlabCiSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: GitlabConfig): Promise<[boolean, VError]> {
    try {
      const gitlab = Gitlab.instance(config, this.logger);
      await gitlab.checkConnection();
    } catch (error: any) {
      return [false, error];
    }
    return [true, undefined];
  }
  streams(config: GitlabConfig): AirbyteStreamBase[] {
    const group = new Group(config, this.logger);
    const projects = new Projects(config, group, this.logger);
    const pipelines = new Pipelines(config, projects, this.logger);
    const jobs = new Jobs(config, projects, pipelines, this.logger);
    return [group, projects, pipelines, jobs];
  }
}
