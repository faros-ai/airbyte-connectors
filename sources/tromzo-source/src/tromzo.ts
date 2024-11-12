import {AirbyteLogger} from 'faros-airbyte-cdk';
import VError from 'verror';

import {Finding,TromzoConfig} from './types';

export class Tromzo {
  private static tromzo: Tromzo;
  constructor(
    private readonly config: TromzoConfig,
    private readonly logger: AirbyteLogger
  ) {}

  static async instance(
    config: TromzoConfig,
    logger: AirbyteLogger
  ): Promise<Tromzo> {
    const apiKey = config.api_key?.trim();
    if (!apiKey) {
      throw new VError('Please provide a valid Tromzo API key');
    }
    const organization = config.organization?.trim();
    if (!organization) {
      throw new VError('Please provide a valid Tromzo organization');
    }
    return new Tromzo(config, logger);
  }

  async checkConnection(): Promise<void> {
    return;
  }

  // TODO: Implement
  async *findings(): AsyncGenerator<Finding> {
    yield {id: '1'};
  }
}
