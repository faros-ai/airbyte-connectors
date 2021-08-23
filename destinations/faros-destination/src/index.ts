import {
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteConfiguredStream,
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
import {
  EntryUploaderConfig,
  FarosClient,
  withEntryUploader,
} from 'faros-feeds-sdk';
import {keyBy} from 'lodash';
import readline from 'readline';
import {Writable} from 'stream';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {Converter, StreamName} from './converters/converter';
import {ConverterRegistry} from './converters/converter-registry';
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
    try {
      this.init(config);
    } catch (e) {
      return new AirbyteConnectionStatusMessage({
        status: AirbyteConnectionStatus.FAILED,
        message: e.message,
      });
    }
    try {
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

  private init(config: AirbyteConfig): void {
    if (!config.origin) {
      throw new VError('Faros origin is not set');
    }
    if (
      config.jsonata_mode &&
      !Object.values(JSONataApplyMode).includes(config.jsonata_mode)
    ) {
      throw new VError(
        `Invalid JSONata mode ${config.jsonata_mode}. ` +
          `Possible values are ${Object.values(JSONataApplyMode).join(',')}`
      );
    }
    if (config.jsonata_mode) {
      this.jsonataMode = config.jsonata_mode;
    }
    if (
      config.jsonata_expression &&
      (!Array.isArray(config.jsonata_destination_models) ||
        !config.jsonata_destination_models.length)
    ) {
      throw new VError(
        'JSONata destination models must be set when using JSONata expression'
      );
    }
    try {
      this.jsonataConverter = config.jsonata_expression
        ? JSONataConverter.make(
            config.jsonata_expression,
            config.jsonata_destination_models
          )
        : undefined;
    } catch (e) {
      throw new VError(`Failed to initialize JSONata converter. Error: ${e}`);
    }
    try {
      this.farosClient = new FarosClient({
        url: config.api_url,
        apiKey: config.api_key,
      });
    } catch (e) {
      throw new VError(`Failed to initialize Faros Client. Error: ${e}`);
    }
  }

  async *write(
    config: AirbyteConfig,
    catalog: AirbyteConfiguredCatalog,
    stdin: NodeJS.ReadStream,
    dryRun: boolean
  ): AsyncGenerator<AirbyteStateMessage> {
    this.init(config);

    const {streams, deleteModelEntries} =
      this.initStreamsCheckConverters(catalog);

    const entryUploaderConfig: EntryUploaderConfig = {
      name: config.origin,
      url: config.api_url,
      authHeader: config.api_key,
      expiration: config.expiration,
      graphName: config.graph,
      deleteModelEntries,
      logger: this.logger.asPino('debug'),
    };

    const stateMessages: AirbyteStateMessage[] = [];

    if (config.dry_run === true || dryRun) {
      const res = await this.writeEntries(stdin, streams, stateMessages);
      this.logger.info(`Processed ${res.recordsProcessed} records`);
      this.logger.info(
        `Would write ${res.recordsWritten} records, but dry run is enabled`
      );
    } else {
      await withEntryUploader(entryUploaderConfig, async (writer) => {
        const res = await this.writeEntries(
          stdin,
          streams,
          stateMessages,
          writer
        );
        this.logger.info(`Processed ${res.recordsProcessed} records`);
        this.logger.info(`Wrote ${res.recordsWritten} records`);
      });
    }

    // Since we are writing all records in a single revision,
    // we should be ok to return all the state messages at the end,
    // once the revision has been closed.
    for (const state of stateMessages) yield state;
  }

  private async writeEntries(
    stdin: NodeJS.ReadStream,
    streams: Dictionary<AirbyteConfiguredStream>,
    stateMessages: AirbyteStateMessage[],
    writer?: Writable
  ): Promise<{recordsProcessed: number; recordsWritten: number}> {
    const res = {recordsProcessed: 0, recordsWritten: 0};

    // readline.createInterface() will start to consume the input stream once invoked.
    // Having asynchronous operations between interface creation and asynchronous iteration may
    // result in missed lines.
    const input = readline.createInterface({
      input: stdin,
      terminal: stdin.isTTY,
    });

    try {
      // Process input & write records
      for await (const line of input) {
        try {
          const msg = parseAirbyteMessage(line);
          if (msg.type === AirbyteMessageType.STATE) {
            stateMessages.push(msg as AirbyteStateMessage);
          } else if (msg.type === AirbyteMessageType.RECORD) {
            const recordMessage = (msg as AirbyteRecord).unpackRaw();
            if (!recordMessage.record) {
              throw new VError('Empty record');
            }
            const record = recordMessage.record;
            const stream = streams[record.stream];
            if (!stream) {
              throw new VError(`Undefined stream ${record.stream}`);
            }
            const converter = this.getConverter(record.stream);
            res.recordsWritten += this.writeRecord(
              converter,
              recordMessage,
              writer
            );
            res.recordsProcessed++;
          }
        } catch (e) {
          this.logger.error(`Error processing input: ${e}`);
          throw e;
        }
      }
    } finally {
      input.close();
      writer?.end();
    }

    return res;
  }

  private initStreamsCheckConverters(catalog: AirbyteConfiguredCatalog): {
    streams: Dictionary<AirbyteConfiguredStream>;
    deleteModelEntries: ReadonlyArray<string>;
  } {
    const streams = keyBy(catalog.streams, (s) => s.stream.name);

    // Check streams & initialize converters
    const deleteModelEntries = [];
    for (const stream in streams) {
      const destinationSyncMode = streams[stream].destination_sync_mode;
      if (!destinationSyncMode) {
        throw new VError(
          `Undefined destination sync mode for stream ${stream}`
        );
      }

      const converter = this.getConverter(stream);
      this.logger.info(
        `Using ${converter.constructor.name} converter to convert ${stream} stream records`
      );

      // Prepare destination models to delete if any
      if (destinationSyncMode === DestinationSyncMode.OVERWRITE) {
        deleteModelEntries.push(...converter.destinationModels);
      }
    }
    return {streams, deleteModelEntries};
  }

  private getConverter(stream: string): Converter {
    const converter = ConverterRegistry.getConverter(
      StreamName.fromString(stream)
    );
    if (!converter && !this.jsonataConverter) {
      throw new VError(`Undefined converter for stream ${stream}`);
    }
    return this.jsonataMode === JSONataApplyMode.OVERRIDE
      ? this.jsonataConverter ?? converter
      : converter ?? this.jsonataConverter;
  }

  private writeRecord(
    converter: Converter,
    recordMessage: AirbyteRecord,
    writer?: Writable
  ): number {
    // Apply conversion on the input record
    const results = converter.convert(recordMessage);

    // Write out the results to the output stream
    for (const result of results) {
      if (!result.record['source']) {
        result.record['source'] = converter.streamName.source;
      }
      const obj: Dictionary<any> = {};
      obj[result.model] = result.record;
      writer?.write(obj);
    }

    return results.length;
  }
}
