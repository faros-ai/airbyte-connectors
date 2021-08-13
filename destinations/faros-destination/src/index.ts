import {
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteConfiguredStream,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusValue,
  AirbyteDestination,
  AirbyteDestinationRunner,
  AirbyteLogger,
  AirbyteMessageType,
  AirbyteRecord,
  AirbyteSpec,
  AirbyteStateMessage,
  DestinationSyncMode,
  parseAirbyteMessage,
} from 'cdk';
import {Command} from 'commander';
import {FarosClient} from 'faros-feeds-sdk';
import {keyBy} from 'lodash';
import readline from 'readline';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

/** The main entry point. */
export function mainCommand(): Command {
  const logger = new AirbyteLogger();
  const destination = new FarosDestination(logger);
  return new AirbyteDestinationRunner(logger, destination).mainCommand();
}

/** Faros destination implementation. */
class FarosDestination extends AirbyteDestination {
  constructor(
    private readonly logger: AirbyteLogger,
    private farosClient: FarosClient = undefined
  ) {
    super();
  }

  getFarosClient(): FarosClient {
    if (this.farosClient) return this.farosClient;
    throw new VError('Faros client is not initialized');
  }

  async spec(): Promise<AirbyteSpec> {
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async check(config: AirbyteConfig): Promise<AirbyteConnectionStatus> {
    try {
      this.farosClient = new FarosClient({
        url: config.api_url,
        apiKey: config.api_key,
      });
      await this.farosClient.tenant();
    } catch (err) {
      return new AirbyteConnectionStatus({
        status: AirbyteConnectionStatusValue.FAILED,
        message: `Ivalid Faros API url or key. Error: ${err.message}`,
      });
    }

    return new AirbyteConnectionStatus({
      status: AirbyteConnectionStatusValue.SUCCEEDED,
    });
  }

  async *write(
    config: AirbyteConfig,
    catalog: AirbyteConfiguredCatalog,
    input: readline.Interface
  ): AsyncGenerator<AirbyteStateMessage> {
    const streams = keyBy(catalog.streams, (s) => s.stream.name);
    this.checkStreams(streams);

    for await (const line of input) {
      try {
        const msg = parseAirbyteMessage(line);
        if (msg.type === AirbyteMessageType.STATE) {
          yield msg as AirbyteStateMessage;
        } else if (msg.type === AirbyteMessageType.RECORD) {
          await this.writeRecord(msg as AirbyteRecord, streams);
        }
      } catch (e) {
        this.logger.error(e);
      }
    }

    yield new AirbyteStateMessage({data: {cutoff: Date.now()}});
  }

  private checkStreams(streams: Dictionary<AirbyteConfiguredStream>): void {
    for (const stream in streams) {
      if (!streams[stream].destination_sync_mode) {
        throw new VError(
          `Undefined destination sync mode for stream ${stream}`
        );
      }
    }
  }

  private writeRecord(
    recordMessage: AirbyteRecord,
    streams: Dictionary<AirbyteConfiguredStream>
  ): Promise<void> {
    const record = recordMessage.record;
    const stream = streams[record.stream];

    if (!stream) {
      this.logger.debug(
        `Undefined stream ${record.stream}. Skipping record: ${JSON.stringify(
          record
        )}`
      );
      return;
    }

    this.logger.info(`Writing record: ${JSON.stringify(record)}`);

    if (stream.destination_sync_mode === DestinationSyncMode.OVERWRITE) {
      // TODO: full sync
    } else {
      // TODO: incremental sync
    }

    return;
  }
}
