import {
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
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
import {entryUploader, EntryUploaderConfig, FarosClient} from 'faros-feeds-sdk';
import {keyBy} from 'lodash';
import readline from 'readline';
import {Writable} from 'stream';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {Converter, ConverterRegistry} from './converters/converter';

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

  async check(config: AirbyteConfig): Promise<AirbyteConnectionStatusMessage> {
    if (!config.origin) {
      return new AirbyteConnectionStatusMessage({
        status: AirbyteConnectionStatus.FAILED,
        message: 'Faros origin is not set',
      });
    }
    try {
      this.farosClient = new FarosClient({
        url: config.api_url,
        apiKey: config.api_key,
      });
      await this.getFarosClient().tenant();
    } catch (e) {
      return new AirbyteConnectionStatusMessage({
        status: AirbyteConnectionStatus.FAILED,
        message: `Ivalid Faros API url or API key. Error: ${e}`,
      });
    }
    try {
      await this.getFarosClient().graphExists(config.graph);
    } catch (e) {
      return new AirbyteConnectionStatusMessage({
        status: AirbyteConnectionStatus.FAILED,
        message: `Ivalid Faros graph ${config.graph}. Error: ${e}`,
      });
    }

    return new AirbyteConnectionStatusMessage({
      status: AirbyteConnectionStatus.SUCCEEDED,
    });
  }

  async *write(
    config: AirbyteConfig,
    catalog: AirbyteConfiguredCatalog,
    input: readline.Interface
  ): AsyncGenerator<AirbyteStateMessage> {
    const streams = keyBy(catalog.streams, (s) => s.stream.name);
    const converters: Dictionary<{
      converter: Converter;
      destinationModel: string;
    }> = {};

    // Check streams & initialize converters
    const deleteModelEntries = [];
    for (const stream in streams) {
      const destinationSyncMode = streams[stream].destination_sync_mode;
      if (!destinationSyncMode) {
        throw new VError(
          `Undefined destination sync mode for stream ${stream}`
        );
      }
      const {converter, destinationModel} =
        ConverterRegistry.getConverter(stream);
      converters[stream] = {converter: new converter(), destinationModel};

      if (destinationSyncMode === DestinationSyncMode.OVERWRITE) {
        deleteModelEntries.push(destinationModel);
      }
    }

    // Prepare entry writer
    const entryUploaderConfig: EntryUploaderConfig = {
      name: config.origin,
      url: config.api_url,
      authHeader: config.api_key,
      expiration: config.expiration ?? '5 seconds',
      graphName: config.graph,
      deleteModelEntries,
    };
    const writer = await entryUploader(entryUploaderConfig);

    let records = 0;
    // Process input & write records
    for await (const line of input) {
      try {
        const msg = parseAirbyteMessage(line);

        if (msg.type === AirbyteMessageType.STATE) {
          yield msg as AirbyteStateMessage;
        } else if (msg.type === AirbyteMessageType.RECORD) {
          const recordMessage = msg as AirbyteRecord;
          if (!recordMessage.record) {
            throw new VError('Empty record');
          }
          const record = recordMessage.record;
          const stream = streams[record.stream];
          if (!stream) {
            throw new VError(`Undefined stream ${record.stream}`);
          }
          const {converter, destinationModel} = converters[record.stream];
          if (!converter) {
            throw new VError(`Undefined converter for stream ${record.stream}`);
          }
          await this.writeRecord(
            writer,
            converter,
            destinationModel,
            recordMessage
          );
          records++;
        }
      } catch (e) {
        this.logger.error(`Error processing input ${line}: ${e}`);
      }
    }
    this.logger.info(`Processed ${records} records`);
    writer.end();
  }

  private writeRecord(
    writer: Writable,
    converter: Converter,
    destinationModel: string,
    recordMessage: AirbyteRecord
  ): Promise<void> {
    const record = recordMessage.record;
    this.logger.info(`Writing record: ${JSON.stringify(record)}`);

    const converted = converter.convert(recordMessage);
    const obj: any = {};
    obj[destinationModel] = converted;
    writer.write(obj);

    this.logger.info(`Wrote: ${JSON.stringify(obj)}`);
    return;
  }
}
