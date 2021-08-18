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

import {
  Converter,
  ConverterInstance,
  ConverterRegistry,
} from './converters/converter';
import {JSONataApplyMode, JSONataConverter} from './converters/jsonata';

/** The main entry point. */
export function mainCommand(options?: {
  exitOverride?: boolean;
  suppressOutput?: boolean;
}): Command {
  const logger = new AirbyteLogger();
  const destination = new FarosDestination(logger);
  const destinationRunner = new AirbyteDestinationRunner(logger, destination);
  const program = destinationRunner.mainCommand();

  if (options?.exitOverride) {
    program.exitOverride();
  }
  if (options?.suppressOutput) {
    program.configureOutput({
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      writeOut: () => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      writeErr: () => {},
    });
  }

  return program;
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
    if (
      config.jsonata_expression &&
      (!Array.isArray(config.jsonata_destination_models) ||
        !config.jsonata_destination_models.length)
    ) {
      return new AirbyteConnectionStatusMessage({
        status: AirbyteConnectionStatus.FAILED,
        message:
          'JSONata destination models must be set when using JSONata expression',
      });
    }
    try {
      this.jsonataConverter = config.jsonata_expression
        ? JSONataConverter.make(config.jsonata_expression)
        : undefined;
    } catch (e) {
      return new AirbyteConnectionStatusMessage({
        status: AirbyteConnectionStatus.FAILED,
        message: `Failed to initialize JSONata converter. Error: ${e}`,
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
    const converters: Dictionary<ConverterInstance> = {};

    // Check streams & initialize converters
    const deleteModelEntries = [];
    for (const stream in streams) {
      const destinationSyncMode = streams[stream].destination_sync_mode;
      if (!destinationSyncMode) {
        throw new VError(
          `Undefined destination sync mode for stream ${stream}`
        );
      }
      let converter = ConverterRegistry.getConverterInstance(stream);
      if (!converter && !this.jsonataConverter) {
        throw new VError(`Undefined converter for stream ${stream}`);
      } else if (
        this.jsonataMode === JSONataApplyMode.OVERRIDE ||
        (this.jsonataMode === JSONataApplyMode.FALLBACK && !converter)
      ) {
        converter = {
          converter: this.jsonataConverter,
          destinationModels: config.jsonata_destination_models,
        };
      }
      converters[stream] = converter;

      if (destinationSyncMode === DestinationSyncMode.OVERWRITE) {
        deleteModelEntries.push(...converter.destinationModels);
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
    converters: Dictionary<ConverterInstance>,
    recordMessage: AirbyteRecord
  ): Promise<void> {
    const stream = recordMessage.record.stream;
    const conv = converters[stream];

    // Apply conversion on the input record
    if (!conv) {
      throw new VError(`Undefined converter for stream ${stream}`);
    }
    const results = conv.converter.convert(recordMessage);

    // Write out the results to the output stream
    for (const result of results) {
      writer.write(result);
    }
    return;
  }
}
