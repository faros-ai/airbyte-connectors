import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Phabricator, PhabricatorConfig} from './phabricator';
import {
  Commits,
  Projects,
  Repositories,
  RevisionDiffs,
  Revisions,
  Transactions,
  Users,
} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new PhabricatorSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Phabricator source implementation. */
export class PhabricatorSource extends AirbyteSourceBase<PhabricatorConfig> {
  get type(): string {
    return 'phabricator';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: PhabricatorConfig): Promise<[boolean, VError]> {
    try {
      const phabricator = Phabricator.instance(config, this.logger);
      await phabricator.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: PhabricatorConfig): AirbyteStreamBase[] {
    return [
      new Repositories(config, this.logger),
      new Commits(config, this.logger),
      new Revisions(config, this.logger),
      new RevisionDiffs(config, this.logger),
      new Users(config, this.logger),
      new Projects(config, this.logger),
      new Transactions(config, this.logger),
    ];
  }
}
