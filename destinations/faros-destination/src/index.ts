import {
  AirbyteCatalog,
  AirbyteConfig,
  AirbyteConnectionStatus,
  AirbyteDestination,
  AirbyteDestinationRunner,
  AirbyteLogger,
  AirbyteSpec,
  AirbyteState,
} from 'cdk';
import {Command} from 'commander';
import readline from 'readline';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const source = new FarosDestination(logger);
  return new AirbyteDestinationRunner(logger, source).mainCommand();
}

/** Faros destination implementation. */
class FarosDestination extends AirbyteDestination {
  constructor(private readonly logger: AirbyteLogger) {
    super();
  }

  async spec(): Promise<AirbyteSpec> {
    return require('../resources/spec.json');
  }

  async check(config: AirbyteConfig): Promise<AirbyteConnectionStatus> {
    const status = config.user === 'chris' ? 'SUCCEEDED' : 'FAILED';
    return {status};
  }

  async discover(): Promise<AirbyteCatalog> {
    return require('../resources/catalog.json');
  }

  async write(
    config: AirbyteConfig,
    catalog: AirbyteCatalog,
    input: readline.Interface
  ): Promise<AirbyteState | undefined> {
    input.on('line', (line: string) => {
      this.logger.info('writing: ' + line);
    });

    return {cutoff: Date.now()};
  }
}
