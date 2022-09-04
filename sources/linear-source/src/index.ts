import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {LinearClient} from './client/LinearClient';
import {Linear, LinearConfig} from './linear/linear';
import {
  Attachment,
  AuditEntry,
  Comment,
  Cycle,
  Document,
  Issue,
  IssueHistory,
  IssueLabel,
  IssueRelation,
  Milestone,
  Organization,
  Project,
  ProjectLink,
  ProjectUpdate,
  Team,
  TeamKey,
  TeamMembership,
  User,
  WorkflowState,
} from './streams';
import {Cycles, Issues, Labels, Projects, Teams, Users} from './streams-public';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new LinearSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Linear source implementation. */
export class LinearSource extends AirbyteSourceBase {
  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: AirbyteConfig): Promise<[boolean, VError]> {
    try {
      if (config.api_type === 'paid') {
        const client = new LinearClient({api_key: config.api_key});
        await client.checkConnection();
        return [true, undefined];
      }
      if (config.api_type === 'public') {
        const linear = Linear.instance(config as LinearConfig, this.logger);
        await linear.checkConnection();
        return [true, undefined];
      }
    } catch (err: any) {
      return [false, err];
    }
  }
  streams(config: AirbyteConfig): AirbyteStreamBase[] {
    if (config.api_type === 'paid') {
      const client = new LinearClient({api_key: config.api_key});
      return [
        new Issue(this.logger, client),
        new Organization(this.logger, client),
        new Team(this.logger, client),
        new TeamKey(this.logger, client),
        new TeamMembership(this.logger, client),
        new User(this.logger, client),
        new Milestone(this.logger, client),
        new Project(this.logger, client),
        new ProjectUpdate(this.logger, client),
        new ProjectLink(this.logger, client),
        new IssueHistory(this.logger, client),
        new IssueLabel(this.logger, client),
        new IssueRelation(this.logger, client),
        new Attachment(this.logger, client),
        new AuditEntry(this.logger, client),
        new Comment(this.logger, client),
        new Cycle(this.logger, client),
        new WorkflowState(this.logger, client),
        new Document(this.logger, client),
      ];
    }
    if (config.api_type === 'public') {
      return [
        new Cycles(config as LinearConfig, this.logger),
        new Issues(config as LinearConfig, this.logger),
        new Labels(config as LinearConfig, this.logger),
        new Projects(config as LinearConfig, this.logger),
        new Teams(config as LinearConfig, this.logger),
        new Users(config as LinearConfig, this.logger),
      ];
    }
  }
}
