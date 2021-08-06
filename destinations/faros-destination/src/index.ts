import {
  AirbyteCatalog,
  AirbyteConfig,
  AirbyteConnectionStatus,
  AirbyteDestination,
  AirbyteDestinationRunner,
  AirbyteLogger,
  AirbyteMessageType,
  AirbyteSpec,
  AirbyteState,
  ConfiguredAirbyteCatalog,
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

  async check(config: AirbyteConfig): Promise<AirbyteConnectionStatus> {
    const status = config.user === 'chris' ? 'SUCCEEDED' : 'FAILED';
    return new AirbyteConnectionStatus({status});
  }

  async *write(
    config: AirbyteConfig,
    catalog: ConfiguredAirbyteCatalog,
    input: readline.Interface
  ): AsyncGenerator<AirbyteState> {
    for await (const line of input) {
      try {
        const msg = parseAirbyteMessage(line);
        if (msg.type === AirbyteMessageType.STATE) {
          yield msg as AirbyteState;
        } else if (msg.type === AirbyteMessageType.RECORD) {
          this.logger.info('writing: ' + JSON.stringify(msg));
        }
      } catch (e) {
        this.logger.error(e);
      }
    }

    yield new AirbyteState({data: {cutoff: Date.now()}});
  }
}
