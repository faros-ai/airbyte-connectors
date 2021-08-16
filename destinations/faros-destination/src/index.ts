import {
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteDestination,
  AirbyteDestinationRunner,
  AirbyteLogger,
  AirbyteMessageType,
  AirbyteSpec,
  AirbyteStateMessage,
  parseAirbyteMessage,
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

  async check(config: AirbyteConfig): Promise<AirbyteConnectionStatusMessage> {
    const status =
      config.user === 'chris'
        ? AirbyteConnectionStatus.SUCCEEDED
        : AirbyteConnectionStatus.FAILED;
    return new AirbyteConnectionStatusMessage({status});
  }

  async *write(
    config: AirbyteConfig,
    catalog: AirbyteConfiguredCatalog,
    input: readline.Interface
  ): AsyncGenerator<AirbyteStateMessage> {
    for await (const line of input) {
      try {
        const msg = parseAirbyteMessage(line);
        if (msg.type === AirbyteMessageType.STATE) {
          yield msg as AirbyteStateMessage;
        } else if (msg.type === AirbyteMessageType.RECORD) {
          this.logger.info('writing: ' + JSON.stringify(msg));
        }
      } catch (e) {
        this.logger.error(e);
      }
    }

    yield new AirbyteStateMessage({data: {cutoff: Date.now()}});
  }
}
