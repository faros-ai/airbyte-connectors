import {Command} from 'commander';
import {
  AirbyteSourceBase,
  AirbyteSourceLogger,
  AirbyteSourceRunner,
  AirbyteSpec,
  AirbyteStreamBase,
} from 'faros-airbyte-cdk';
import VError from 'verror';

import {AutocompleteAnalytics} from './streams/autocomplete_analytics';
import {UserPageAnalytics} from './streams/user_page_analytics';
import {WindsurfConfig} from './types';
import {Windsurf} from './windsurf';

export function mainCommand(): Command {
  const logger = new AirbyteSourceLogger();
  const source = new WindsurfSource(logger);
  return new AirbyteSourceRunner(logger, source).mainCommand();
}

export class WindsurfSource extends AirbyteSourceBase<WindsurfConfig> {
  get type(): string {
    return 'windsurf';
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async checkConnection(config: WindsurfConfig): Promise<[boolean, VError]> {
    try {
      const windsurf = Windsurf.instance(config, this.logger);
      await windsurf.checkConnection();
    } catch (err: any) {
      return [false, err];
    }
    return [true, undefined];
  }

  streams(config: WindsurfConfig): AirbyteStreamBase[] {
    return [
      new UserPageAnalytics(config, this.logger),
      new AutocompleteAnalytics(config, this.logger),
    ];
  }
}
