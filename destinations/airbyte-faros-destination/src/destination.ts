import Analytics from 'analytics-node';
import {
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteConfiguredStream,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteDestination,
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
import {intersection, keyBy, sortBy, uniq} from 'lodash';
import readline from 'readline';
import {Writable} from 'stream';
import {Dictionary} from 'ts-essentials';
import util from 'util';
import {v4 as uuidv4, validate} from 'uuid';
import {VError} from 'verror';

import {WriteStats} from './common/write-stats';
import {HasuraClient} from './community/hasura-client';
import {HasuraWriter} from './community/hasura-writer';
import {
  Converter,
  parseObjectConfig,
  StreamContext,
  StreamName,
  StreamNameSeparator,
} from './converters/converter';
import {ConverterRegistry} from './converters/converter-registry';
import {JSONataApplyMode, JSONataConverter} from './converters/jsonata';

export enum InvalidRecordStrategy {
  FAIL = 'FAIL',
  SKIP = 'SKIP',
}

export enum Edition {
  COMMUNITY = 'community',
  CLOUD = 'cloud',
}

interface FarosDestinationState {
  readonly lastSynced: string;
}

/** Faros destination implementation. */
export class FarosDestination extends AirbyteDestination {
  constructor(
    private readonly logger: AirbyteLogger,
    private edition: Edition = undefined,
    private farosClient: FarosClient = undefined,
    private jsonataConverter: Converter | undefined = undefined,
    private jsonataMode: JSONataApplyMode = JSONataApplyMode.FALLBACK,
    private invalidRecordStrategy: InvalidRecordStrategy = InvalidRecordStrategy.SKIP,
    private hasuraClient: HasuraClient = undefined,
    private analytics: Analytics = undefined
  ) {
    super();
  }

  getFarosClient(): FarosClient {
    if (this.farosClient) return this.farosClient;
    throw new VError('Faros client is not initialized');
  }

  getHasuraClient(): HasuraClient {
    if (this.hasuraClient) return this.hasuraClient;
    throw new VError('Hasura client is not initialized');
  }

  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec(require('../resources/spec.json'));
  }

  async check(config: AirbyteConfig): Promise<AirbyteConnectionStatusMessage> {
    try {
      await this.init(config);
    } catch (e: any) {
      return new AirbyteConnectionStatusMessage({
        status: AirbyteConnectionStatus.FAILED,
        message: e.message,
      });
    }
    return new AirbyteConnectionStatusMessage({
      status: AirbyteConnectionStatus.SUCCEEDED,
    });
  }

  private async initCommunity(config: AirbyteConfig): Promise<void> {
    if (!config.edition_configs.hasura_url) {
      throw new VError('Community Edition Hasura URL is not set');
    }
    try {
      this.hasuraClient = new HasuraClient(
        config.edition_configs.hasura_url,
        config.edition_configs.hasura_admin_secret
      );
    } catch (e) {
      throw new VError(`Failed to initialize Hasura Client. Error: ${e}`);
    }
    try {
      if (config.dry_run !== true) {
        await this.getHasuraClient().healthCheck();
      }
    } catch (e) {
      throw new VError(`Invalid Hasura url. Error: ${e}`);
    }

    const segmentUserId = config.edition_configs.segment_user_id;
    if (segmentUserId) {
      if (!validate(segmentUserId)) {
        throw new VError(
          `Segment User Id ${segmentUserId} is not a valid UUID. Example: ${uuidv4()}`
        );
      }
      // Segment host is used for testing purposes only
      const host = config.edition_configs?.segment_test_host;
      // Only create the client if there's a user id specified
      this.analytics = new Analytics('YEu7VC65n9dIR85pQ1tgV2RHQHjo2bwn', {
        host,
      });
    }
  }

  private async initCloud(config: AirbyteConfig): Promise<void> {
    if (!config.edition_configs.api_url) {
      throw new VError('API URL is not set');
    }
    if (!config.edition_configs.api_key) {
      throw new VError('API key is not set');
    }
    try {
      this.farosClient = new FarosClient({
        url: config.edition_configs.api_url,
        apiKey: config.edition_configs.api_key,
      });
    } catch (e) {
      throw new VError(`Failed to initialize Faros Client. Error: ${e}`);
    }
    try {
      if (config.dry_run !== true) {
        await this.getFarosClient().tenant();
      }
    } catch (e) {
      throw new VError(`Invalid Faros API url or API key. Error: ${e}`);
    }
    const graph = config.edition_configs.graph;
    try {
      const exists = await this.getFarosClient().graphExists(graph);
      if (!exists) {
        throw new VError(`Faros graph ${graph} does not exist`);
      }
    } catch (e) {
      throw new VError(`Invalid Faros graph ${graph}. Error: ${e}`);
    }
  }

  private initGlobal(config: AirbyteConfig): void {
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
    const jira_configs = config.source_specific_configs?.jira ?? {};
    if (
      typeof jira_configs.truncate_limit === 'number' &&
      jira_configs.truncate_limit < 0
    ) {
      throw new VError('Jira Truncate Limit must be a non-negative number');
    }
    if (
      typeof jira_configs.additional_fields_array_limit === 'number' &&
      jira_configs.additional_fields_array_limit < 0
    ) {
      throw new VError(
        'Jira Additional Fields Array Limit must be a non-negative number'
      );
    }

    const objectTypeConfigKeys: [string, string][] = [
      ['bitbucket', 'application_mapping'],
      ['pagerduty', 'application_mapping'],
      ['squadcast', 'application_mapping'],
      ['statuspage', 'application_mapping'],
      ['victorops', 'application_mapping'],
    ];
    objectTypeConfigKeys.forEach((k) =>
      parseObjectConfig(
        config.source_specific_configs?.[k[0]]?.[k[1]],
        k.join('.')
      )
    );
  }

  private async init(config: AirbyteConfig): Promise<void> {
    const edition = config.edition_configs?.edition;
    if (!edition) {
      throw new VError('Faros Edition is not set');
    }
    this.edition = edition;
    if (edition === Edition.COMMUNITY) {
      await this.initCommunity(config);
    } else if (edition === Edition.CLOUD) {
      await this.initCloud(config);
    } else {
      throw new VError(
        `Invalid run mode ${edition}. ` +
          `Possible values are ${Object.values(Edition).join(',')}`
      );
    }
    this.initGlobal(config);
  }

  private getOrigin(
    config: AirbyteConfig,
    catalog: AirbyteConfiguredCatalog
  ): string {
    if (config.origin) {
      this.logger.info(`Using origin ${config.origin} found in config`);
      return config.origin;
    }

    // Determine origin from stream prefixes
    const origins = uniq(
      catalog.streams.map((s) => s.stream.name.split(StreamNameSeparator, 1)[0])
    );
    if (origins.length === 0) {
      throw new VError('Could not determine origin from catalog');
    } else if (origins.length > 1) {
      throw new VError(
        `Found multiple possible origins from catalog: ${origins.join(',')}`
      );
    }
    this.logger.info(`Determined origin ${origins[0]} from stream prefixes`);
    return origins[0];
  }

  async *write(
    config: AirbyteConfig,
    catalog: AirbyteConfiguredCatalog,
    stdin: NodeJS.ReadStream,
    dryRun: boolean
  ): AsyncGenerator<AirbyteStateMessage> {
    await this.init(config);

    const origin = this.getOrigin(config, catalog);
    const {streams, deleteModelEntries, converterDependencies} =
      this.initStreamsCheckConverters(catalog);

    const stateMessages: AirbyteStateMessage[] = [];
    const stats = new WriteStats();

    const dryRunEnabled = config.dry_run === true || dryRun;

    // Avoid creating a new revision and writer when dry run or community edition is enabled
    try {
      if (dryRunEnabled) {
        this.logger.info("Dry run is ENABLED. Won't write any records");

        await this.writeEntries(
          config,
          stdin,
          streams,
          stateMessages,
          converterDependencies,
          stats
        );
      } else if (this.edition === Edition.COMMUNITY) {
        const hasura = this.getHasuraClient();
        await hasura.loadSchema();
        await hasura.resetData(origin, deleteModelEntries);

        const writer = new HasuraWriter(
          hasura,
          origin,
          stats,
          this.handleRecordProcessingError
        );

        await this.writeEntries(
          config,
          stdin,
          streams,
          stateMessages,
          converterDependencies,
          stats,
          writer
        );
      } else {
        this.logger.info(
          `Opening a new revision on graph ${config.edition_configs.graph} ` +
            `with expiration of ${config.edition_configs.expiration}`
        );

        // Log all models to be deleted (if any)
        if (deleteModelEntries.length > 0) {
          const modelsToDelete = sortBy(deleteModelEntries).join(',');
          this.logger.info(
            `Deleting records in destination graph ${config.edition_configs.graph} for models: ${modelsToDelete}`
          );
        }
        // Create an entry uploader for the destination graph
        const entryUploaderConfig: EntryUploaderConfig = {
          name: origin,
          url: config.edition_configs.api_url,
          authHeader: config.edition_configs.api_key,
          expiration: config.edition_configs.expiration,
          graphName: config.edition_configs.graph,
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
                `Destination graph ${config.edition_configs.graph} was ${lastSynced}`
              );
              // Process input and write entries
              await this.writeEntries(
                config,
                stdin,
                streams,
                stateMessages,
                converterDependencies,
                stats,
                writer
              );
              // Return the current time
              return {lastSynced: new Date().toISOString()};
            } finally {
              // Don't forget to close the writer
              if (!writer.writableEnded) writer.end();
            }
          }
        );
      }

      if (this.analytics) {
        this.logger.info('Sending write stats to Segment.');
        const fn = (callback: ((err: Error) => void) | undefined): void => {
          this.analytics
            .track(
              {
                event: 'Write Stats',
                userId: config.edition_configs.segment_user_id,
                properties: stats,
              },
              callback
            )
            .flush(callback);
        };
        await util
          .promisify(fn)()
          .catch((err) =>
            this.logger.error(
              `Failed to send write stats to Segment: ${err.message}`
            )
          );
      }

      // Since we are writing all records in a single revision,
      // we should be ok to return all the state messages at the end,
      // once the revision has been closed.
      for (const state of stateMessages) yield state;
    } finally {
      // Log collected statistics
      stats.log(this.logger, dryRunEnabled ? 'Would write' : 'Wrote');
    }
  }

  private async writeEntries(
    config: AirbyteConfig,
    stdin: NodeJS.ReadStream,
    streams: Dictionary<AirbyteConfiguredStream>,
    stateMessages: AirbyteStateMessage[],
    converterDependencies: Set<string>,
    stats: WriteStats,
    writer?: Writable | HasuraWriter
  ): Promise<void> {
    const ctx = new StreamContext(
      this.logger,
      config,
      this.edition === Edition.COMMUNITY ? undefined : this.getFarosClient()
    );
    const recordsToBeProcessedLast: ((ctx: StreamContext) => Promise<void>)[] =
      [];

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
        await this.handleRecordProcessingError(stats, async () => {
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
            stats.incrementProcessedByStream(stream);

            const converter = this.getConverter(stream);
            // No need to fail on records we don't have a converter yet
            if (!converter) {
              stats.recordsSkipped++;
              return;
            }

            const writeRecord = async (
              context: StreamContext
            ): Promise<void> => {
              stats.recordsWritten += await this.writeRecord(
                converter,
                unpacked,
                stats,
                context,
                writer
              );
              stats.recordsProcessed++;
            };

            // Check if any converters depend on this record stream.
            // If yes, keep the record in the stream context for other converters to get.
            const streamName = StreamName.fromString(stream).asString;
            const recordId = converter.id(unpacked);
            if (converterDependencies.has(streamName) && recordId) {
              ctx.set(streamName, String(recordId), unpacked);
              // Print stream context stats every so often
              if (stats.recordsProcessed % 1000 == 0) {
                this.logger.info(`Stream context stats: ${ctx.stats(false)}`);
              }
            }
            // Process the record immediately if converter has no dependencies,
            // otherwise process it later once all streams are processed.
            if (converter.dependencies.length === 0) {
              await writeRecord(ctx);
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
        for await (const process of recordsToBeProcessedLast) {
          await this.handleRecordProcessingError(stats, () => process(ctx));
        }
      }
      // Don't forget to close the writer
      await writer?.end();
    } finally {
      input.close();
    }
  }

  private async handleRecordProcessingError(
    stats: WriteStats,
    processRecord: () => Promise<void>
  ): Promise<void> {
    try {
      await processRecord();
    } catch (e: any) {
      stats.recordsErrored++;
      this.logger.error(
        `Error processing input: ${e.message ?? JSON.stringify(e)}`
      );
      switch (this.invalidRecordStrategy) {
        case InvalidRecordStrategy.SKIP:
          stats.recordsSkipped++;
          break;
        case InvalidRecordStrategy.FAIL:
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
      const converter = this.getConverter(stream, (err: Error) => {
        if (err.message.includes('Cannot find module ')) {
          this.logger.info(`No converter found for ${stream}`);
        } else {
          this.logger.error(err.message);
        }
      });
      if (converter) {
        this.logger.info(
          `Using ${converter.constructor.name} converter to convert ${stream} stream records`
        );

        // Collect all converter dependencies
        if (converter.dependencies.length > 0) {
          const streamName = converter.streamName.asString;
          if (!dependenciesByStream[streamName]) {
            dependenciesByStream[streamName] = new Set<string>();
          }
          const deps = dependenciesByStream[streamName];
          converter.dependencies.forEach((d) => deps.add(d.asString));
        }

        // Prepare destination models to delete if any
        if (destinationSyncMode === DestinationSyncMode.OVERWRITE) {
          deleteModelEntries.push(...converter.destinationModels);
        }
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
  ): Converter | undefined {
    const converter = ConverterRegistry.getConverter(
      StreamName.fromString(stream),
      onLoadError
    );
    return this.jsonataMode === JSONataApplyMode.OVERRIDE
      ? this.jsonataConverter ?? converter
      : converter ?? this.jsonataConverter;
  }

  private async writeRecord(
    converter: Converter,
    recordMessage: AirbyteRecord,
    stats: WriteStats,
    ctx: StreamContext,
    writer?: Writable | HasuraWriter
  ): Promise<number> {
    // Apply conversion on the input record
    const results = await converter.convert(recordMessage, ctx);

    if (!Array.isArray(results)) {
      throw new VError('Invalid results: not an array');
    }

    let recordsWritten = 0;
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

      let isTimestamped = false;
      if (writer) {
        if (writer instanceof HasuraWriter) {
          isTimestamped = await writer.write(result);
        } else {
          const obj: Dictionary<any> = {};
          obj[result.model] = result.record;
          writer.write(obj);
        }
      }
      if (!isTimestamped) {
        recordsWritten++;
        stats.incrementWrittenByModel(result.model);
      }
    }

    return recordsWritten;
  }
}
