import {Command} from 'commander';
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
} from 'faros-airbyte-cdk';
import {
  EntryUploaderConfig,
  FarosClient,
  withEntryUploader,
} from 'faros-feeds-sdk';
import _, {keyBy} from 'lodash';
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

export enum InvalidRecordStrategy {
  FAIL = 'FAIL',
  SKIP = 'SKIP',
}

interface WriteStats {
  readonly recordsProcessed: number;
  readonly recordsWritten: number;
  readonly recordsErrored: number;
  readonly recordsByStream: Dictionary<number>;
}

/** Faros destination implementation. */
class FarosDestination extends AirbyteDestination {
  constructor(
    private readonly logger: AirbyteLogger,
    private farosClient: FarosClient = undefined,
    private jsonataConverter: Converter | undefined = undefined,
    private jsonataMode: JSONataApplyMode = JSONataApplyMode.FALLBACK,
    private invalidRecordStrategy: InvalidRecordStrategy = InvalidRecordStrategy.SKIP
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
      config.invalid_record_strategy &&
      !Object.values(InvalidRecordStrategy).includes(
        config.invalid_record_strategy
      )
    ) {
      throw new VError(
        `Invalid strategy ${config.invalid_record_strategy}. ` +
          `Possible values are ${Object.values(InvalidRecordStrategy).join(
            ','
          )}`
      );
    }
    if (config.invalid_record_strategy) {
      this.invalidRecordStrategy = config.invalid_record_strategy;
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
      this.logger.info("Dry run is ENABLED. Won't write any records");
      await this.writeEntries(stdin, streams, stateMessages);
    } else {
      await withEntryUploader(entryUploaderConfig, async (writer) => {
        await this.writeEntries(stdin, streams, stateMessages, writer);
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
  ): Promise<WriteStats> {
    const res = {
      recordsProcessed: 0,
      recordsWritten: 0,
      recordsErrored: 0,
      recordsByStream: {},
    };

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
            const streamName = recordMessage.record.stream;
            const stream = streams[streamName];
            if (!stream) {
              throw new VError(`Undefined stream ${streamName}`);
            }
            const count = res.recordsByStream[streamName];
            res.recordsByStream[streamName] = count ? count + 1 : 1;

            const converter = this.getConverter(streamName);
            res.recordsWritten += this.writeRecord(
              converter,
              recordMessage,
              writer
            );
            res.recordsProcessed++;
          }
        } catch (e) {
          res.recordsErrored++;
          this.logger.error(
            `Error processing input: ${e.message ? e.message : e}`
          );
          if (this.invalidRecordStrategy === InvalidRecordStrategy.FAIL) {
            throw e;
          }
        }
      }
    } finally {
      this.logWriteStats(res, writer);
      input.close();
      writer?.end();
    }

    return res;
  }

  private logWriteStats(res: WriteStats, writer?: Writable): void {
    this.logger.info(`Processed ${res.recordsProcessed} records`);
    const sorted = _(res.recordsByStream)
      .toPairs()
      .orderBy(0, 'asc')
      .fromPairs()
      .value();
    this.logger.info(`Processed records by stream: ${JSON.stringify(sorted)}`);
    this.logger.info(
      `${writer ? 'Wrote' : 'Would write'} ${res.recordsWritten} records`
    );
    this.logger.info(`Errored ${res.recordsErrored} records`);
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

    if (!Array.isArray(results))
      throw new VError('Invalid results: not an array');

    // Write out the results to the output stream
    for (const result of results) {
      if (!result.model) throw new VError('Invalid result: undefined model');
      if (!result.record) throw new VError('Invalid result: undefined record');
      if (typeof result.record !== 'object')
        throw new VError('Invalid result: record is not an object');

      // Set the source if missing
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
