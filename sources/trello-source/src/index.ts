import {Command} from 'commander';
import {
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Actions, Boards, Cards, Labels, Users} from './streams';
import {Trello, TrelloConfig} from './trello';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new TrelloSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Trello source implementation. */
export class TrelloSource extends AirbyteSourceBase<TrelloConfig> {
  get type(): string {
    return 'trello';
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  async checkConnection(config: TrelloConfig): Promise<[boolean, VError]> {
    try {
      const trello = Trello.instance(config);
      await trello.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  streams(config: TrelloConfig): AirbyteStreamBase[] {
    return [
      new Actions(config, this.logger),
      new Boards(config, this.logger),
      new Cards(config, this.logger),
      new Labels(config, this.logger),
      new Users(config, this.logger),
    ];
  }
}
