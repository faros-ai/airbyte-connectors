import {Analytics} from '@segment/analytics-node';
import {
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteConfiguredStream,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteDestination,
  AirbyteMessageType,
  AirbyteRecord,
  AirbyteSourceConfigMessage,
  AirbyteSourceStatus,
  AirbyteSpec,
  AirbyteStateMessage,
  DestinationSyncMode,
  isSourceConfigMessage,
  isSourceLogsMessage,
  isSourceStatusMessage,
  isStateMessage,
  minimizeSpec,
  parseAirbyteMessage,
  SpecLoader,
  SyncMessage,
  SyncMode,
  wrapApiError,
} from 'faros-airbyte-cdk';
import {ConnectorVersion} from 'faros-airbyte-cdk/lib/runner';
import {FarosClientConfig, HasuraSchemaLoader, Schema} from 'faros-js-client';
import http from 'http';
import https from 'https';
import {difference, isEmpty, keyBy, pickBy, sortBy, uniq} from 'lodash';
import path from 'path';
import readline from 'readline';
import {Writable} from 'stream';
import {Dictionary} from 'ts-essentials';
import {v4 as uuidv4, validate} from 'uuid';
import {VError} from 'verror';

import {GraphQLClient} from './common/graphql-client';
import {GraphQLWriter} from './common/graphql-writer';
import {
  DestinationConfig,
  Edition,
  InvalidRecordStrategy,
} from './common/types';
import {WriteStats} from './common/write-stats';
import {HasuraBackend} from './community/hasura-backend';
import {
  Converter,
  DestinationRecordTyped,
  parseObjectConfig,
  StreamContext,
  StreamName,
  StreamNameSeparator,
} from './converters/converter';
import {ConverterRegistry} from './converters/converter-registry';
import {JSONataApplyMode, JSONataConverter} from './converters/jsonata';
import {FarosDestinationLogger, LogFiles} from './destination-logger';
import {RecordRedactor} from './record-redactor';
import FarosSyncClient, {Account, AccountSync} from './sync';

const PACKAGE_ROOT = path.join(__dirname, '..');
const BASE_RESOURCES_DIR = path.join(PACKAGE_ROOT, 'resources');
const DEFAULT_API_URL = 'https://prod.api.faros.ai';
export const SEGMENT_KEY = 'YEu7VC65n9dIR85pQ1tgV2RHQHjo2bwn';

export interface HttpAgents {
  httpAgent?: http.Agent;
  httpsAgent?: https.Agent;
}

interface SyncErrors {
  src: {fatal: SyncMessage[]; nonFatal: SyncMessage[]; warnings: SyncMessage[]};
  dst: SyncMessage[];
}

// This is used to wrap the version string and allow us to pass the source version back via function calls.
interface SourceVersion {
  version?: string;
}

/** Faros destination implementation. */
export class FarosDestination extends AirbyteDestination<DestinationConfig> {
  constructor(
    private readonly logger: FarosDestinationLogger,
    private specOverride: AirbyteSpec = undefined,
    private edition: Edition = undefined,
    private farosClientConfig: FarosClientConfig = undefined,
    private farosClient: FarosSyncClient = undefined,
    private farosGraph: string = undefined,
    private jsonataConverter: Converter | undefined = undefined,
    private jsonataMode: JSONataApplyMode = JSONataApplyMode.FALLBACK,
    private invalidRecordStrategy: InvalidRecordStrategy = InvalidRecordStrategy.SKIP,
    private excludeFieldsByModel: Dictionary<ReadonlyArray<string>> = {},
    private redactFieldsByModel: Dictionary<ReadonlyArray<string>> = {},
    private redactor: RecordRedactor = undefined,
    private graphQLClient: GraphQLClient = undefined,
    private analytics: Analytics = undefined,
    private segmentUserId: string = undefined
  ) {
    super();
  }

  onConfigCheck: (config: DestinationConfig) => Promise<void> = undefined;

  getFarosClient(): FarosSyncClient {
    if (this.farosClient) return this.farosClient;
    if (this.edition === Edition.CLOUD) {
      throw new VError('Faros Client is not initialized');
    }
  }

  getGraphQLClient(): GraphQLClient {
    if (this.graphQLClient) return this.graphQLClient;
    if (this.edition === Edition.COMMUNITY) {
      throw new VError('GraphQL Client is not initialized');
    }
  }

  async spec(minimize: boolean = true): Promise<AirbyteSpec> {
    const spec = this.specOverride
      ? this.specOverride
      : await SpecLoader.loadSpec(path.join(BASE_RESOURCES_DIR, 'spec.json'));
    return minimize ? minimizeSpec(spec) : spec;
  }

  async check(
    config: DestinationConfig
  ): Promise<AirbyteConnectionStatusMessage> {
    try {
      await this.init(config);
      if (this.onConfigCheck) {
        await this.onConfigCheck(config);
      }
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

  private makeHttpAgents(keepAlive?: boolean): HttpAgents {
    return keepAlive
      ? {
          httpAgent: new http.Agent({keepAlive: true}),
          httpsAgent: new https.Agent({keepAlive: true}),
        }
      : {};
  }

  private async initCommunity(config: DestinationConfig): Promise<void> {
    if (!config.edition_configs.hasura_url) {
      throw new VError('Community Edition Hasura URL is not set');
    }
    try {
      const backend = new HasuraBackend(
        config.edition_configs.hasura_url,
        config.edition_configs.hasura_admin_secret,
        this.makeHttpAgents(config.keep_alive)
      );
      const schemaLoader = new HasuraSchemaLoader(
        config.edition_configs.hasura_url,
        config.edition_configs.hasura_admin_secret
      );
      this.graphQLClient = new GraphQLClient(
        this.logger,
        schemaLoader,
        backend,
        0,
        config.edition_configs.community_graphql_batch_size,
        false,
        config.reset_page_size
      );
    } catch (e) {
      throw new VError(`Failed to initialize Hasura Client. Error: ${e}`);
    }
    try {
      if (!config.dry_run) {
        await this.getGraphQLClient().healthCheck();
      }
    } catch (e) {
      throw new VError(`Invalid Hasura url. Error: ${e}`);
    }

    this.segmentUserId = config.edition_configs.segment_user_id;
    if (this.segmentUserId) {
      if (!validate(this.segmentUserId)) {
        throw new VError(
          `Segment User Id ${
            this.segmentUserId
          } is not a valid UUID. Example: ${uuidv4()}`
        );
      }
      // Segment host is used for testing purposes only
      const host = config.edition_configs?.segment_test_host;
      // Only create the client if there's a user id specified
      this.analytics = new Analytics({
        writeKey: SEGMENT_KEY,
        host,
      }).on('error', (err) => {
        this.logger.error(
          `Failed to send write stats to Segment: ${err.code}`,
          JSON.stringify(err.reason)
        );
      });
    }
  }

  private async initCloud(config: DestinationConfig): Promise<void> {
    if (!config.edition_configs.api_key) {
      throw new VError('API key is not set');
    }
    try {
      this.farosClientConfig = {
        url: config.edition_configs.api_url ?? DEFAULT_API_URL,
        apiKey: config.edition_configs.api_key,
      };

      const axiosConfig = {
        timeout: 60000,
        ...this.makeHttpAgents(config.keep_alive),
      };
      this.farosClient = new FarosSyncClient(
        this.farosClientConfig,
        this.logger,
        axiosConfig
      );
    } catch (e) {
      throw new VError(`Failed to initialize Faros Client. Error: ${e}`);
    }
    try {
      if (!config.dry_run && config.edition_configs.check_connection) {
        await this.getFarosClient().tenant();
      }
    } catch (e) {
      throw new VError(`Invalid Faros API url or API key. Error: ${e}`);
    }
    this.farosGraph = config.edition_configs.graph;
    try {
      if (!config.dry_run && config.edition_configs.check_connection) {
        const exists = await this.getFarosClient().graphExists(this.farosGraph);
        if (!exists) {
          throw new VError(`Faros graph ${this.farosGraph} does not exist`);
        }
      }
    } catch (e) {
      throw new VError(`Invalid Faros graph ${this.farosGraph}. Error: ${e}`);
    }
    await this.initGraphQLV2(config);
  }

  private async initGraphQLV2(config: DestinationConfig): Promise<void> {
    const client = this.getFarosClient();
    const graph = this.farosGraph;
    try {
      const backend = {
        async healthCheck(): Promise<void> {
          await client.graphExists(graph);
        },
        async postQuery(query: any, variables?: any): Promise<any> {
          const finalVars = {
            ...variables,
            // ensure all queries run against primary
            noStaleReads: true,
          };
          return await client.rawGql(graph, query, finalVars);
        },
      };
      const schemaLoader = {
        async loadSchema(): Promise<Schema> {
          return await client.gqlSchema(graph);
        },
      };
      this.graphQLClient = new GraphQLClient(
        this.logger,
        schemaLoader,
        backend,
        config.edition_configs.cloud_graphql_upsert_batch_size,
        config.edition_configs.cloud_graphql_batch_size,
        true,
        config.reset_page_size
      );
    } catch (e) {
      throw new VError(`Failed to initialize GraphQLClient. Error: ${e}`);
    }
    try {
      if (!config.dry_run && config.edition_configs.check_connection) {
        await this.getGraphQLClient().healthCheck();
      }
    } catch (e) {
      throw new VError(`Failed to health check GraphQLClient. Error: ${e}`);
    }
  }

  private initGlobal(config: DestinationConfig): void {
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

    if (config.exclude_fields_map) {
      this.excludeFieldsByModel =
        typeof config.exclude_fields_map === 'object'
          ? config.exclude_fields_map
          : JSON.parse(config.exclude_fields_map);
    } else {
      this.excludeFieldsByModel = {};
    }

    if (config.redact_fields_map) {
      this.redactFieldsByModel =
        typeof config.redact_fields_map === 'object'
          ? config.redact_fields_map
          : JSON.parse(config.redact_fields_map);
    } else {
      this.redactFieldsByModel = {};
    }

    this.redactor = new RecordRedactor(
      config.redact_custom_replace,
      typeof config.redact_custom_regex === 'string'
        ? JSON.parse(config.redact_custom_regex)
        : config.redact_custom_regex
    );

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

  private async init(config: DestinationConfig): Promise<void> {
    let edition = config.edition_configs?.edition;

    if (!edition && !config.dry_run) {
      this.logger.info('Edition is not set. Assuming Faros Cloud edition');
      edition = Edition.CLOUD;
    }

    this.edition = edition;

    switch (edition) {
      case Edition.COMMUNITY:
        await this.initCommunity(config);
        break;
      case Edition.CLOUD:
        await this.initCloud(config);
        break;
    }

    this.initGlobal(config);
  }

  private getOrigin(
    config: DestinationConfig,
    catalog: AirbyteConfiguredCatalog
  ): string {
    if (config.origin) {
      this.logger.info(`Using origin '${config.origin}' found in config`);
      return config.origin;
    }

    // Determine origin from stream prefixes
    const origins: string[] = uniq(
      catalog.streams.map((s) => s.stream.name.split(StreamNameSeparator, 1)[0])
    );
    if (origins.length === 0) {
      throw new VError('Could not determine origin from catalog');
    } else if (origins.length > 1) {
      throw new VError(
        `Found multiple possible origins from catalog: ${origins.join(',')}`
      );
    }
    const origin = origins[0];
    this.logger.info(`Determined origin '${origin}' from stream prefixes`);
    return origin;
  }

  async *write(
    config: DestinationConfig,
    redactedConfig: AirbyteConfig,
    catalog: AirbyteConfiguredCatalog,
    stdin: NodeJS.ReadStream,
    dryRun: boolean
  ): AsyncGenerator<AirbyteStateMessage> {
    const startedAt = new Date();
    const origin = this.getOrigin(config, catalog);
    const accountId = config.faros_source_id || origin;
    const dryRunEnabled = config.dry_run === true || dryRun;
    await this.init({...config, dry_run: dryRunEnabled});

    let account: Account;
    let sync: AccountSync;
    let logFiles: LogFiles;
    if (!dryRunEnabled && this.edition === Edition.CLOUD) {
      account = await this.getFarosClient().getOrCreateAccount(
        accountId,
        this.farosGraph,
        redactedConfig
      );

      // WORKER_JOB_ID is populated by Airbyte
      let logId = process.env['WORKER_JOB_ID'] || undefined; // don't send empty string
      if (account) {
        sync = await this.getFarosClient().createAccountSync(
          accountId,
          startedAt,
          logId
        );
        this.logger.shouldSaveLogs =
          !!account.local &&
          sync &&
          config.edition_configs.upload_sync_logs !== false;
        if (this.logger.shouldSaveLogs) {
          logId = undefined; // let Faros generate a unique log id
          logFiles = new LogFiles(this.logger);
          this.logger.logFiles = logFiles;
        }
      }
    }

    const {
      streams,
      deleteModelEntries,
      resetModelsByStream,
      converterDependencies,
    } = this.initStreamsCheckConverters(catalog);

    const streamsSyncMode: Dictionary<DestinationSyncMode> = {};
    for (const stream of Object.keys(streams)) {
      streamsSyncMode[stream] = streams[stream].destination_sync_mode;
    }

    let latestStateMessage: AirbyteStateMessage = undefined;
    const stats = new WriteStats();
    const syncErrors: SyncErrors = {
      src: {fatal: [], nonFatal: [], warnings: []},
      dst: [],
    };
    const sourceVersion: SourceVersion = {};

    // Avoid creating a new revision and writer when dry run or community edition is enabled
    try {
      const streamContext = new StreamContext(
        this.logger,
        config,
        streamsSyncMode,
        this.farosGraph,
        origin,
        this.edition === Edition.CLOUD ? this.getFarosClient() : undefined
      );

      if (dryRunEnabled) {
        let recWriter;
        this.logger.info("Dry run is ENABLED. Won't write any records");
        if (config.log_records) {
          this.logger.info('Will log converted records');
          recWriter = new Writable({
            objectMode: true,
            write: (chunk, encoding, callback) => {
              this.logger.write(AirbyteRecord.make('dry_run', chunk));
              callback();
            },
          });
        }
        for await (const stateMessage of this.writeEntries(
          config,
          streamContext,
          stdin,
          streams,
          converterDependencies,
          stats,
          syncErrors,
          recWriter
        )) {
          latestStateMessage = stateMessage;
        }
      } else if (this.graphQLClient) {
        this.logger.info(`Using GraphQLClient for writer`);
        const graphQLClient = this.getGraphQLClient();
        await graphQLClient.loadSchema();

        for (const [stream, models] of Object.entries(resetModelsByStream)) {
          streamContext.registerStreamResetModels(stream, models);
        }

        let originRemapper = undefined;
        const acceptInputRecordsOrigin =
          config.accept_input_records_origin ?? true;
        if (acceptInputRecordsOrigin) {
          const originMap = JSON.parse(config.replace_origin_map ?? '{}');
          originRemapper = (origin: string): string => {
            return originMap[origin] ?? origin;
          };
        }
        const writer = new GraphQLWriter(
          graphQLClient,
          acceptInputRecordsOrigin
            ? {
                getOrigin: (record: Dictionary<any>): string => {
                  if (!record.origin) {
                    return streamContext.getOrigin();
                  }
                  if (!originRemapper) {
                    return record.origin;
                  }
                  return originRemapper(record.origin);
                },
              }
            : streamContext,
          stats,
          this
        );

        try {
          for await (const stateMessage of this.writeEntries(
            config,
            streamContext,
            stdin,
            streams,
            converterDependencies,
            stats,
            syncErrors,
            writer,
            logFiles,
            async (isResetSync: boolean) =>
              await graphQLClient.resetData(
                streamContext,
                Array.from(streamContext.getModelsForReset()),
                isResetSync,
                this.edition === Edition.COMMUNITY
              ),
            async (msg: AirbyteSourceConfigMessage) => {
              if (account?.local) {
                await this.getFarosClient().updateLocalAccount(
                  accountId,
                  this.farosGraph,
                  {...redactedConfig, ...msg.redactedConfig},
                  msg.sourceType,
                  msg.sourceMode
                );
              }
            },
            sourceVersion
          )) {
            await graphQLClient.flush();
            yield stateMessage;
          }
        } catch (error: any) {
          const wrappedError = wrapApiError(error);
          this.logger.error(
            `Encountered an error while writing records to Faros: ${wrappedError} - ${JSON.stringify(
              wrappedError
            )}`,
            wrappedError.stack
          );
          const destinationError: SyncMessage = {
            summary: wrappedError.message ?? JSON.stringify(wrappedError),
            code: 0, // placeholder
            action: 'Contact Faros Support', // placeholder
            type: 'ERROR',
          };
          syncErrors.dst.push(destinationError);
          throw error;
        } finally {
          if (sync?.syncId) {
            await this.getFarosClient().updateAccountSync(
              accountId,
              sync.syncId,
              {
                endedAt: new Date(),
                status:
                  syncErrors.src.fatal.length || syncErrors.dst.length
                    ? 'error'
                    : 'success',
                metrics: stats.asObject(),
                errors: syncErrors.src.fatal.concat(
                  syncErrors.src.nonFatal,
                  syncErrors.dst
                ),
                warnings: syncErrors.src.warnings,
                sourceVersion: sourceVersion.version,
                destinationVersion: ConnectorVersion,
              }
            );
          }
        }
      }

      if (this.analytics) {
        this.logger.debug('Sending write stats to Segment');
        this.analytics.track({
          event: 'Write Stats',
          userId: this.segmentUserId,
          properties: stats,
        });
        this.analytics.closeAndFlush();
      }

      // Airbyte updates connection state whenever the destination emits a state
      // message, indicating that prior records have been processed.  Since we
      // are writing all records in a single revision, only return the final
      // state message at the end, once the revision has been closed.
      if (latestStateMessage) {
        yield latestStateMessage;
      }

      if (config.fail_on_source_error) {
        const sourceErrors = syncErrors.src.fatal.concat(
          syncErrors.src.nonFatal
        );
        if (sourceErrors.length) {
          throw new VError(
            `Failing sync due to ${sourceErrors.length} source error(s): ` +
              `${sourceErrors.map((e) => e.summary).join('; ')}`
          );
        }
      }
    } finally {
      // Log collected statistics
      stats.log(this.logger, dryRunEnabled ? 'Would write' : 'Wrote');
      if (logFiles) {
        const logs = await logFiles.sortedLogs(this.logger);
        if (account?.local && sync?.syncId && logs) {
          await this.getFarosClient().uploadLogs(accountId, sync.syncId, logs);
        }
      }
    }
  }

  private async *writeEntries(
    config: DestinationConfig,
    ctx: StreamContext,
    stdin: NodeJS.ReadStream,
    streams: Dictionary<AirbyteConfiguredStream>,
    converterDependencies: Set<string>,
    stats: WriteStats,
    syncErrors: SyncErrors,
    writer?: Writable | GraphQLWriter,
    logFiles?: LogFiles,
    resetData?: (isResetSync: boolean) => Promise<void>,
    updateLocalAccount?: (msg: AirbyteSourceConfigMessage) => Promise<void>,
    sourceVersion?: SourceVersion
  ): AsyncGenerator<AirbyteStateMessage | undefined> {
    const recordsToBeProcessedLast: ((ctx: StreamContext) => Promise<void>)[] =
      [];
    const convertersUsed: Map<string, Converter> = new Map();

    // NOTE: readline.createInterface() will start to consume the input stream once invoked.
    // Having asynchronous operations between interface creation and asynchronous iteration may
    // result in missed lines.
    const input = readline.createInterface({
      input: stdin,
      terminal: stdin.isTTY,
    });

    try {
      let isBackfillSync = false;
      let sourceConfigReceived = false;
      let sourceSucceeded = false;
      let stateReset = false;
      let streamStatusReceived = false;
      const processedStreams: Set<string> = new Set();
      // Process input & write records
      for await (const line of input) {
        let stateMessage: AirbyteStateMessage = undefined;

        await this.handleRecordProcessingError(stats, async () => {
          const msg = parseAirbyteMessage(line);
          stats.messagesRead++;
          if (isStateMessage(msg)) {
            if (isSourceStatusMessage(msg)) {
              const status = msg.sourceStatus?.status;
              if (status === 'SUCCESS') {
                sourceSucceeded = true;
              }
              const syncMessage = getSyncMessage(msg.sourceStatus);
              if (syncMessage) {
                if (status === 'ERRORED') {
                  syncErrors.src.fatal.push(syncMessage);
                } else if (syncMessage.type === 'ERROR') {
                  syncErrors.src.nonFatal.push(syncMessage);
                } else {
                  syncErrors.src.warnings.push(syncMessage);
                }
              }
              stateMessage = new AirbyteStateMessage(msg.state);
              if (msg.streamStatus?.name) {
                this.logger.info(
                  `Received ${msg.streamStatus.status} status for ${msg.streamStatus.name} stream`
                );
                if (msg.streamStatus.status === 'SUCCESS') {
                  if (msg.streamStatus.recordsEmitted) {
                    this.logger.info(
                      `Marking ${msg.streamStatus.name} stream models for reset`
                    );
                    ctx.markStreamForReset(msg.streamStatus.name);
                  } else {
                    this.logger.warn(
                      `No records emitted for ${msg.streamStatus.name} stream.` +
                        ' Will not reset non-incremental models.'
                    );
                  }
                }
                streamStatusReceived = true;
              }
            } else if (isSourceConfigMessage(msg)) {
              if (msg.redactedConfig?.backfill) {
                isBackfillSync = true;
              }
              sourceConfigReceived = true;
              await updateLocalAccount?.(msg);
              sourceVersion.version = msg.sourceVersion;
              ctx.setSourceConfig(msg.redactedConfig);
              if (Array.isArray(msg.redactedConfig?.skip_reset_models)) {
                msg.redactedConfig.skip_reset_models.forEach((model) => {
                  this.logger.info(`Disabling model reset for ${model}`);
                  ctx.disableResetForModel(model);
                });
              }
            } else if (isSourceLogsMessage(msg)) {
              this.logger.debug(`Received ${msg.logs.length} source logs`);
              logFiles?.writeSourceLogs(...msg.logs);
            } else {
              stateMessage = msg;
              stateReset = isEmpty(msg.state?.data);
            }
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
            // Collect all the used converters
            if (!convertersUsed.has(stream)) {
              convertersUsed.set(stream, converter);
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
                this.logger.info(`Stream context stats: ${ctx.stats()}`);
              }
            }
            // Process the record immediately if converter has no pending stream
            // dependencies, otherwise process it later once the required
            // streams are processed.
            if (
              converter.dependencies.length > 0 &&
              difference(
                converter.dependencies.map((d) => d.asString),
                [...processedStreams]
              ).length > 0
            ) {
              recordsToBeProcessedLast.push(writeRecord);
            } else {
              // Since streams are processed sequentially, we can assume that we
              // won't see records from a different stream until all of this
              // stream's records have been processed.
              if (!processedStreams.has(streamName)) {
                processedStreams.add(streamName);
              }
              await writeRecord(ctx);
            }
          }
        });

        if (stateMessage && !isBackfillSync) {
          yield stateMessage;
        }
      }
      // Process all the remaining records
      if (recordsToBeProcessedLast.length > 0) {
        this.logger.info(
          `Stdin processing completed, but still have ${recordsToBeProcessedLast.length} records to process`
        );
        this.logger.info(`Stream context stats: ${ctx.stats()}`);
        for await (const process of recordsToBeProcessedLast) {
          await this.handleRecordProcessingError(stats, () => process(ctx));
        }
      }

      // Invoke on processing complete handler on all the active converters
      for (const converter of convertersUsed.values()) {
        const results = await converter.onProcessingComplete(ctx);
        stats.recordsWritten += await this.writeConvertedRecords(
          converter,
          results,
          stats,
          writer
        );
      }

      const isResetSync =
        process.env.WORKER_JOB_ID &&
        stats.messagesRead === 1 &&
        stats.recordsProcessed === 0 &&
        stateReset &&
        !sourceConfigReceived &&
        Object.values(streams)
          .map((s) => s.destination_sync_mode)
          .every((m) => m === DestinationSyncMode.OVERWRITE);

      if (
        sourceConfigReceived &&
        !sourceSucceeded &&
        !syncErrors.src.fatal.length &&
        !syncErrors.src.nonFatal.length
      ) {
        syncErrors.src.fatal.push({
          summary:
            'No success status received from Faros Source. It may have crashed before it could report an error.',
          code: 0, // placeholder
          action: 'Check your connector execution environment for errors',
          type: 'ERROR',
        });
      }

      if (
        this.shouldResetData({
          syncErrors,
          streamStatusReceived,
          skipSourceSuccessCheck: config.skip_source_success_check,
          isResetSync,
          isBackfillSync,
          isFarosSource: sourceConfigReceived,
          sourceSucceeded,
        })
      ) {
        if (!streamStatusReceived) {
          ctx.markAllStreamsForReset();
        }
        await resetData?.(isResetSync);
      }

      if (isResetSync) {
        if (config.faros_source_id && this.farosClient) {
          this.logger.info(
            `Resetting account state for ${config.faros_source_id}`
          );
          try {
            await this.farosClient.request(
              'DELETE',
              `/accounts/${config.faros_source_id}/state`
            );
          } catch (e: any) {
            const message = e.message ?? JSON.stringify(e);
            this.logger.warn(
              `Failed to reset account state for ${config.faros_source_id}: ${message}`
            );
          }
        }
      }

      // Don't forget to close the writer
      await writer?.end();
    } finally {
      input.close();
    }
  }

  private shouldResetData(syncInfo: {
    syncErrors: SyncErrors;
    streamStatusReceived: boolean;
    skipSourceSuccessCheck: boolean;
    isResetSync: boolean;
    isBackfillSync: boolean;
    isFarosSource: boolean;
    sourceSucceeded: boolean;
  }): boolean {
    const {
      syncErrors,
      streamStatusReceived,
      skipSourceSuccessCheck,
      isResetSync,
      isBackfillSync,
      isFarosSource,
      sourceSucceeded,
    } = syncInfo;
    if (streamStatusReceived) {
      if (syncErrors.dst.length) {
        this.logger.warn(
          'Skipping reset of non-incremental models for successful streams due to destination errors:' +
            ` ${syncErrors.dst.map((e) => e.summary).join('; ')}`
        );
        return false;
      } else {
        this.logger.info(
          'Received at least one stream status message. Resetting non-incremental models for successful streams.'
        );
        return true;
      }
    }
    const allSyncErrors = syncErrors.src.fatal.concat(
      syncErrors.src.nonFatal,
      syncErrors.dst
    );
    if (allSyncErrors.length) {
      const errorSummary = allSyncErrors.map((e) => e.summary).join('; ');
      this.logger.error(
        `Skipping reset of non-incremental models due to sync errors: ${errorSummary}`
      );
      return false;
    }
    if (isResetSync) {
      this.logger.info('Running a reset sync. Resetting all models.');
      return true;
    }
    if (isBackfillSync) {
      this.logger.info(
        'Running a backfill sync. Skipping reset of non-incremental models.'
      );
      return false;
    }
    if (sourceSucceeded) {
      this.logger.info('Source succeeded. Resetting non-incremental models.');
      return true;
    }
    if (skipSourceSuccessCheck) {
      if (isFarosSource) {
        this.logger.warn(
          'Skip source success check is not supported for Faros Airbyte Sources.'
        );
      } else {
        this.logger.warn(
          'Skip source success check is enabled for non-Faros Airbyte Sources. Resetting non-incremental models.'
        );
        return true;
      }
    }
    this.logger.warn(
      'No success status received from Airbyte Source. Skipping reset of non-incremental models.'
    );
    return false;
  }

  async handleRecordProcessingError(
    stats: WriteStats,
    processRecord: () => Promise<void>
  ): Promise<void> {
    try {
      await processRecord();
    } catch (e: any) {
      stats.recordsErrored++;
      this.logger.error(
        `Error processing input: ${e.message ?? JSON.stringify(e)}`,
        e.stack
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
    resetModelsByStream: Dictionary<Set<string>>;
    converterDependencies: Set<string>;
  } {
    const streams = keyBy(catalog.streams, (s) => s.stream.name);
    const streamKeys = Object.keys(streams);
    const dependenciesByStream: Dictionary<Set<string>> = {};
    const deleteModelEntries: string[] = [];
    const incrementalModels: string[] = [];
    const resetModelsByStream: Dictionary<Set<string>> = {};

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
          this.logger.warn(`No converter found for ${stream}`);
        } else {
          this.logger.error(err.message, err.stack);
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
          const streamName = StreamName.fromString(stream).name;

          if (resetModelsByStream[streamName]) {
            this.logger.warn(
              `Found multiple streams in the catalog with name ${streamName} but different source types.` +
                ' This may result in unexpected model resets if some streams fail and others succeed.'
            );
            for (const model of converter.destinationModels) {
              resetModelsByStream[streamName].add(model);
            }
          } else {
            resetModelsByStream[streamName] = new Set(
              converter.destinationModels
            );
          }
        } else if (streams[stream].sync_mode === SyncMode.INCREMENTAL) {
          incrementalModels.push(...converter.destinationModels);
        }
      }
    }

    // Check for circular dependencies and error early if any
    this.checkForCircularDependencies(dependenciesByStream);
    // Collect all converter dependencies
    const converterDependencies = new Set<string>();
    Object.keys(dependenciesByStream).forEach((k) =>
      dependenciesByStream[k].forEach((v) => converterDependencies.add(v))
    );

    // Remove incremental models from resetModels map
    for (const model of incrementalModels) {
      for (const resetModels of Object.values(resetModelsByStream)) {
        resetModels.delete(model);
      }
    }

    return {
      streams,
      deleteModelEntries: difference(
        uniq(deleteModelEntries),
        uniq(incrementalModels)
      ),
      resetModelsByStream,
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
    writer?: Writable | GraphQLWriter
  ): Promise<number> {
    // Apply conversion on the input record
    const results = await converter.convert(recordMessage, ctx);
    // Write the converted records
    return this.writeConvertedRecords(converter, results, stats, writer);
  }

  private async writeConvertedRecords<R>(
    converter: Converter,
    results: ReadonlyArray<DestinationRecordTyped<R>>,
    stats: WriteStats,
    writer?: Writable | GraphQLWriter
  ): Promise<number> {
    if (!Array.isArray(results))
      throw new VError('Invalid results: not an array');

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
      // Exclude record fields if necessary
      const exclusions = this.excludeFieldsByModel[result.model];
      if (exclusions?.length > 0) {
        result.record = pickBy(
          result.record,
          (_v, k) => !exclusions.includes(k)
        );
      }
      // Redact record fields if necessary
      const fieldsToRedact = this.redactFieldsByModel[result.model];
      if (fieldsToRedact?.length > 0) {
        result.record = this.redactor.redactRecord(
          result.record,
          fieldsToRedact
        );
      }

      // Write the record & increment the stats
      let isTimestamped = false;
      if (writer) {
        if (writer instanceof GraphQLWriter) {
          isTimestamped = await writer.write(result);
        } else {
          writer.write({[result.model]: result.record});
        }
      }
      if (!isTimestamped) {
        recordsWritten++;
        stats.incrementWrittenByModel(result.model);
      }
    }

    return recordsWritten;
  }

  private addToPath(
    depsByStream: Dictionary<Set<string>>,
    dep: string,
    path: string[]
  ): void {
    if (path.includes(dep)) {
      throw new VError(
        `Circular converter dependency detected: ${path
          .slice(path.indexOf(dep))
          .concat(dep)
          .join(',')}`
      );
    }
    path.push(dep);
    if (depsByStream[dep]) {
      return depsByStream[dep].forEach((next) =>
        this.addToPath(depsByStream, next, [...path])
      );
    }
  }

  checkForCircularDependencies(depsByStream: Dictionary<Set<string>>): void {
    Object.keys(depsByStream).forEach((dep) => {
      const dd = [...depsByStream[dep].values()];
      this.logger.info(
        `Records of stream ${dep} will be accumulated and processed last, ` +
          `since their converter has dependencies on streams: ${dd.join(',')}`
      );
      this.addToPath(depsByStream, dep, []);
    });
  }
}

function getSyncMessage(
  sourceStatus: AirbyteSourceStatus
): SyncMessage | undefined {
  // backwards compatibility with older Airbyte Source versions
  if ((sourceStatus as any).error) {
    return (sourceStatus as any).error as SyncMessage;
  }

  return sourceStatus.message;
}
