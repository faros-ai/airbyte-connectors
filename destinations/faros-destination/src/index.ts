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
import _, {intersection, keyBy, sortBy, uniq} from 'lodash';
import readline from 'readline';
import {Writable} from 'stream';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {Converter, StreamContext, StreamName} from './converters/converter';
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
  messagesRead: number;
  recordsRead: number;
  recordsProcessed: number;
  recordsWritten: number;
  recordsErrored: number;
  processedByStream: Dictionary<number>;
  writtenByModel: Dictionary<number>;
}

interface FarosDestinationState {
  readonly lastSynced: string;
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
    } catch (e: any) {
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

    const {streams, deleteModelEntries, converterDependencies} =
      this.initStreamsCheckConverters(catalog);

    const stateMessages: AirbyteStateMessage[] = [];

    // Avoid creating a new revision and writer when dry run is enabled
    if (config.dry_run === true || dryRun) {
      this.logger.info("Dry run is ENABLED. Won't write any records");
      await this.writeEntries(
        stdin,
        streams,
        stateMessages,
        converterDependencies
      );
    } else {
      // Log all models to be deleted (if any)
      if (deleteModelEntries.length > 0) {
        const modelsToDelete = sortBy(deleteModelEntries).join(',');
        this.logger.info(
          `Deleting records in destination graph ${config.graph} for models: ${modelsToDelete}`
        );
      }
      // Create an entry uploader for the destination graph
      const entryUploaderConfig: EntryUploaderConfig = {
        name: config.origin,
        url: config.api_url,
        authHeader: config.api_key,
        expiration: config.expiration,
        graphName: config.graph,
        deleteModelEntries,
        logger: this.logger.asPino('debug'),
      };
      await withEntryUploader<FarosDestinationState>(
        entryUploaderConfig,
        async (writer, state) => {
          try {
            // Log last synced time
            const lastSynced = state?.lastSynced
              ? `last synced at ${state.lastSynced}`
              : 'not synced yet';
            this.logger.info(
              `Destination graph ${config.graph} was ${lastSynced}`
            );
            // Process input and write entries
            await this.writeEntries(
              stdin,
              streams,
              stateMessages,
              converterDependencies,
              writer
            );
            // Return the current time
            return {lastSynced: new Date().toISOString()};
          } finally {
            // Don't forget to close the writer
            writer.end();
          }
        }
      );
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
    converterDependencies: Set<string>,
    writer?: Writable
  ): Promise<void> {
    const stats = {
      messagesRead: 0,
      recordsRead: 0,
      recordsProcessed: 0,
      recordsWritten: 0,
      recordsErrored: 0,
      processedByStream: {},
      writtenByModel: {},
    };

    const ctx = new StreamContext();
    const recordsToBeProcessedLast: ((ctx: StreamContext) => void)[] = [];

    // NOTE: readline.createInterface() will start to consume the input stream once invoked.
    // Having asynchronous operations between interface creation and asynchronous iteration may
    // result in missed lines.
    const input = readline.createInterface({
      input: stdin,
      terminal: stdin.isTTY,
    });
    try {
      // Process input & write records
      for await (const line of input) {
        this.handleRecordProcessingError(stats, () => {
          const msg = parseAirbyteMessage(line);
          stats.messagesRead++;
          if (msg.type === AirbyteMessageType.STATE) {
            stateMessages.push(msg as AirbyteStateMessage);
          } else if (msg.type === AirbyteMessageType.RECORD) {
            stats.recordsRead++;
            const recordMessage = msg as AirbyteRecord;
            if (!recordMessage.record) {
              throw new VError('Empty record');
            }
            if (!streams[recordMessage.record.stream]) {
              throw new VError(
                `Undefined stream ${recordMessage.record.stream}`
              );
            }
            const unpacked = recordMessage.unpackRaw();
            if (!unpacked.record) {
              throw new VError('Empty unpacked record');
            }
            const stream = unpacked.record.stream;
            const count = stats.processedByStream[stream];
            stats.processedByStream[stream] = count ? count + 1 : 1;

            const converter = this.getConverter(stream);
            const writeRecord = (context: StreamContext): void => {
              stats.recordsWritten += this.writeRecord(
                converter,
                unpacked,
                stats.writtenByModel,
                context,
                writer
              );
              stats.recordsProcessed++;
            };

            // Check if any converters depend on this record stream.
            // If yes, keep the record in the stream context for other converters to get.
            const streamName = StreamName.fromString(stream).stringify();
            const recordId = converter.id(unpacked);
            if (converterDependencies.has(streamName) && recordId) {
              ctx.set(streamName, String(recordId), unpacked);
              // Print stream context stats every so often
              if (stats.recordsProcessed % 1000 == 0) {
                this.logger.info(`Stream context stats: ${ctx.stats(false)}`);
              }
            }
            // Process the record immidiately if converter has no dependencies,
            // otherwise process it later once all streams are processed.
            if (converter.dependencies.length === 0) {
              writeRecord(ctx);
            } else {
              recordsToBeProcessedLast.push(writeRecord);
            }
          }
        });
      }
      // Process all the remaining records
      if (recordsToBeProcessedLast.length > 0) {
        this.logger.info(
          `Stdin processing completed, but still have ${recordsToBeProcessedLast.length} records to process`
        );
        this.logger.info(`Stream context stats: ${ctx.stats(true)}`);
        recordsToBeProcessedLast.forEach((process) => {
          this.handleRecordProcessingError(stats, () => process(ctx));
        });
      }
    } finally {
      this.logWriteStats(stats, writer);
      input.close();
    }
  }

  private logWriteStats(stats: WriteStats, writer?: Writable): void {
    this.logger.info(`Read ${stats.messagesRead} messages`);
    this.logger.info(`Read ${stats.recordsRead} records`);
    this.logger.info(`Processed ${stats.recordsProcessed} records`);
    const processed = _(stats.processedByStream)
      .toPairs()
      .orderBy(0, 'asc')
      .fromPairs()
      .value();
    this.logger.info(
      `Processed records by stream: ${JSON.stringify(processed)}`
    );
    const writeMsg = writer ? 'Wrote' : 'Would write';
    this.logger.info(`${writeMsg} ${stats.recordsWritten} records`);
    const written = _(stats.writtenByModel)
      .toPairs()
      .orderBy(0, 'asc')
      .fromPairs()
      .value();
    this.logger.info(
      `${writeMsg} records by model: ${JSON.stringify(written)}`
    );
    this.logger.info(`Errored ${stats.recordsErrored} records`);
  }

  private handleRecordProcessingError(
    stats: WriteStats,
    processRecord: () => void
  ): void {
    try {
      processRecord();
    } catch (e: any) {
      stats.recordsErrored++;
      this.logger.error(
        `Error processing input: ${e.message ?? JSON.stringify(e)}`
      );
      if (this.invalidRecordStrategy === InvalidRecordStrategy.FAIL) {
        throw e;
      }
    }
  }

  private initStreamsCheckConverters(catalog: AirbyteConfiguredCatalog): {
    streams: Dictionary<AirbyteConfiguredStream>;
    deleteModelEntries: ReadonlyArray<string>;
    converterDependencies: Set<string>;
  } {
    const streams = keyBy(catalog.streams, (s) => s.stream.name);
    const streamKeys = Object.keys(streams);
    const deleteModelEntries: string[] = [];
    const dependenciesByStream: Dictionary<Set<string>> = {};

    // Check input streams & initialize record converters
    for (const stream of streamKeys) {
      const destinationSyncMode = streams[stream].destination_sync_mode;
      if (!destinationSyncMode) {
        throw new VError(
          `Undefined destination sync mode for stream ${stream}`
        );
      }
      const converter = this.getConverter(stream, (err: Error) =>
        this.logger.error(err.message)
      );
      this.logger.info(
        `Using ${converter.constructor.name} converter to convert ${stream} stream records`
      );

      // Collect all converter dependencies
      if (converter.dependencies.length > 0) {
        const streamName = converter.streamName.stringify();
        if (!dependenciesByStream[streamName]) {
          dependenciesByStream[streamName] = new Set<string>();
        }
        const deps = dependenciesByStream[streamName];
        converter.dependencies.forEach((d) => deps.add(d.stringify()));
      }

      // Prepare destination models to delete if any
      if (destinationSyncMode === DestinationSyncMode.OVERWRITE) {
        deleteModelEntries.push(...converter.destinationModels);
      }
    }
    // Check for circular dependencies and error early if any
    const deps = Object.keys(dependenciesByStream);
    for (const d of deps) {
      const dd = [...dependenciesByStream[d].values()];
      this.logger.info(
        `Records of stream ${d} will be accumulated and processed last, ` +
          `since their converter has dependencies on streams: ${dd.join(',')}`
      );
      const res = intersection(deps, dd);
      if (res.length > 0) {
        throw new VError(
          `Circular converter dependency detected: ${res.join(',')}`
        );
      }
    }
    // Collect all converter dependencies
    const converterDependencies = new Set<string>();
    Object.keys(dependenciesByStream).forEach((k) =>
      dependenciesByStream[k].forEach((v) => converterDependencies.add(v))
    );

    return {
      streams,
      deleteModelEntries: uniq(deleteModelEntries),
      converterDependencies,
    };
  }

  private getConverter(
    stream: string,
    onLoadError?: (err: Error) => void
  ): Converter {
    const converter = ConverterRegistry.getConverter(
      StreamName.fromString(stream),
      onLoadError
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
    writtenByModel: Dictionary<number>,
    ctx: StreamContext,
    writer?: Writable
  ): number {
    // Apply conversion on the input record
    const results = converter.convert(recordMessage, ctx);

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

      const count = writtenByModel[result.model];
      writtenByModel[result.model] = count ? count + 1 : 1;
    }

    return results.length;
  }
}
