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
import {JSONataApplyMode, JSONataConverter} from './converters/jsonata';

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
    private farosClient: FarosClient = undefined,
    private jsonataConverter: Converter | undefined = undefined,
    private jsonataMode: JSONataApplyMode = JSONataApplyMode.FALLBACK
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
        message: `Invalid Faros API url or API key. Error: ${e}`,
      });
    }
    try {
      const exists = await this.getFarosClient().graphExists(config.graph);
      if (!exists) {
        throw new VError(`Faros graph ${config.graph} does not exist`);
      }
    } catch (e) {
      return new AirbyteConnectionStatusMessage({
        status: AirbyteConnectionStatus.FAILED,
        message: `Invalid Faros graph ${config.graph}. Error: ${e}`,
      });
    }
    if (
      config.jsonata_mode &&
      !Object.values(JSONataApplyMode).includes(config.jsonata_mode)
    ) {
      return new AirbyteConnectionStatusMessage({
        status: AirbyteConnectionStatus.FAILED,
        message:
          `Invalid JSONata mode ${config.jsonata_mode}. ` +
          `Possible values are ${Object.values(JSONataApplyMode).join(',')}`,
      });
    }
    if (config.jsonata_mode) {
      this.jsonataMode = config.jsonata_mode;
    }
    try {
      this.jsonataConverter = config.jsonata_expr
        ? JSONataConverter.make(config.jsonata_expr)
        : undefined;
    } catch (e) {
      return new AirbyteConnectionStatusMessage({
        status: AirbyteConnectionStatus.FAILED,
        message: `Failed to initialize JSONata converter. Error: ${e}`,
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
      expiration: config.expiration,
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
          await this.writeRecord(writer, converters, recordMessage);
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
    converters: Dictionary<{
      converter: Converter;
      destinationModel: string;
    }>,
    recordMessage: AirbyteRecord
  ): Promise<void> {
    const stream = recordMessage.record.stream;
    const record = recordMessage.record.data;
    const conv = converters[stream];
    const jsonataConv = this.jsonataConverter;
    let results: ReadonlyArray<Dictionary<any>> = [];

    if (!jsonataConv) {
      if (!conv) {
        throw new VError(`Undefined converter for stream ${stream}`);
      }
      results = conv.converter.convert(record);
    } else {
      switch (this.jsonataMode) {
        case JSONataApplyMode.BEFORE:
          if (!conv) {
            throw new VError(`Undefined converter for stream ${stream}`);
          }
          results = jsonataConv.convert(record).flatMap(conv.converter.convert);
          break;
        case JSONataApplyMode.AFTER:
          if (!conv) {
            throw new VError(`Undefined converter for stream ${stream}`);
          }
          results = conv.converter.convert(record).flatMap(jsonataConv.convert);
          break;
        case JSONataApplyMode.FALLBACK:
          if (!conv) {
            results = jsonataConv.convert(record);
          } else {
            results = conv.converter.convert(record);
          }
          break;
        case JSONataApplyMode.OVERRIDE:
          results = jsonataConv.convert(record);
          break;
      }
    }

    for (const result of results) {
      const obj: Dictionary<any> = {};
      obj[conv.destinationModel] = result;
      writer.write(obj);
    }

    return;
  }
}
