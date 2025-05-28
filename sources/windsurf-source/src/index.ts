import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {WindsurfConfig} from './config';
import {WindsurfClient} from './client';
import {Users, Chats, Commands, PCW} from './streams';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new WindsurfSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

/** Windsurf source implementation. */
export class WindsurfSource extends AirbyteSourceBase<WindsurfConfig> {
  constructor(protected readonly logger: AirbyteSourceLogger) {
    super(logger);
  }

  get type(): string {
    return 'windsurf';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }
  
  async checkConnection(config: WindsurfConfig): Promise<[boolean, VError]> {
    try {
      const client = WindsurfClient.instance(config, this.logger);
      await client.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }
  
  streams(config: WindsurfConfig): AirbyteStreamBase[] {
    return [
      new Users(config, this.logger),
      new Chats(config, this.logger),
      new Commands(config, this.logger),
      new PCW(config, this.logger),
    ];
  }
}
