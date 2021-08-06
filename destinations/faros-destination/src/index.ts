import {
  AirbyteCatalog,
  AirbyteConfig,
  AirbyteConnectionStatus,
  AirbyteDestination,
  AirbyteDestinationRunner,
  AirbyteLog,
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteMessage,
  AirbyteSpec,
} from 'cdk';
import {Command} from 'commander';
import readline from 'readline';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const destination = new FarosDestination(logger);
  return new AirbyteDestinationRunner(logger, destination).mainCommand();
}

/** Faros destination implementation. */
class FarosDestination extends AirbyteDestination {
  constructor(private readonly logger: AirbyteLogger) {
    super();
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async check(config: AirbyteConfig): Promise<AirbyteConnectionStatus> {
    const status = config.user === 'chris' ? 'SUCCEEDED' : 'FAILED';
    return new AirbyteConnectionStatus({status});
  }

  async discover(): Promise<AirbyteCatalog> {
    return new AirbyteCatalog(require('../resources/catalog.json'));
  }

  async *write(
    config: AirbyteConfig,
    catalog: AirbyteCatalog,
    input: readline.Interface
  ): AsyncGenerator<AirbyteMessage> {
    //   input.on('line', (line: string) => {
    //     // We just log the lines for now
    //     // this.logger.info('writing: ' + line);
    //     // yield new AirbyteLog({level: AirbyteLogLevel.INFO, message: line});
    //   });
  }
}
