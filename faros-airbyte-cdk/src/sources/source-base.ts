import {keyBy, pick} from 'lodash';
import toposort from 'toposort';
import VError from 'verror';

import {AirbyteLogger} from '../logger';
import {
  AirbyteCatalogMessage,
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteConfiguredStream,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteLogLevel,
  AirbyteMessage,
  AirbyteMessageType,
  AirbyteRecord,
  AirbyteSourceConfigMessage,
  AirbyteSourceStatusMessage,
  AirbyteState,
  AirbyteStateMessage,
  isSourceStatusMessage,
  isStateMessage,
  SyncMode,
} from '../protocol';
import {ConnectorVersion} from '../runner';
import {Data} from '../utils';
import {AirbyteSource} from './source';
import {AirbyteStreamBase} from './streams/stream-base';

type PartialAirbyteConfig = Pick<AirbyteConfig, 'backfill'>;

/**
 * Airbyte Source base class providing additional boilerplate around the Check
 * and Discover commands, and the logic for processing the Source's streams. The
 * user needs to implement the spec() and checkConnection() methods and the
 * streams.
 */
export abstract class AirbyteSourceBase<
  Config extends AirbyteConfig,
> extends AirbyteSource<Config> {
  constructor(protected readonly logger: AirbyteLogger) {
    super();
  }

  /**
   * Validates the provided configuration by testing the configuration values
   * against the source's technical system.
   * @param config The user-provided configuration as specified by the source's
   * spec. This usually contains information required to check connection e.g.
   * tokens, secrets and keys etc.
   * @return A tuple of (boolean, VError). If boolean is true, then the
   * connection check is successful and we can connect to the underlying data
   * source using the provided configuration. Otherwise, the input config cannot
   * be used to connect to the underlying data source, and the VError should
   * describe what went wrong. The VError message will be displayed to the user.
   */
  abstract checkConnection(
    config: Config
  ): Promise<[boolean, VError | undefined]>;

  /**
   * Implements the streams of this source, for creating the source catalog
   * and processing records from the source's technical system.
   * @param config The user-provided configuration as specified by the source's
   * spec. Any stream construction related operation should happen here.
   * @return A list of the streams in this source connector.
   */
  abstract streams(config: Config): AirbyteStreamBase[];

  /**
   * Source name
   */
  get name(): string {
    return this.constructor.name;
  }

  /**
   * Source type
   */
  abstract get type(): string;

  /**
   * Source mode
   */
  mode(config: Config): string | undefined {
    return undefined;
  }

  /**
   * Implements the Discover operation from the Airbyte Specification. See
   * https://docs.airbyte.io/architecture/airbyte-specification.
   */
  async discover(config: Config): Promise<AirbyteCatalogMessage> {
    this.adjustLoggerLevel(config);
    const streams = this.streams(config).map((stream) =>
      stream.asAirbyteStream()
    );
    return new AirbyteCatalogMessage({streams});
  }

  /**
   * Implements the Check Connection operation from the Airbyte Specification.
   * See https://docs.airbyte.io/architecture/airbyte-specification.
   */
  async check(config: Config): Promise<AirbyteConnectionStatusMessage> {
    this.adjustLoggerLevel(config);
    try {
      const [succeeded, error] = await this.checkConnection(config);
      if (!succeeded) {
        return new AirbyteConnectionStatusMessage({
          status: AirbyteConnectionStatus.FAILED,
          message: error.message,
        });
      }
    } catch (error) {
      return new AirbyteConnectionStatusMessage({
        status: AirbyteConnectionStatus.FAILED,
        message:
          (error as Error).message ?? `Unknown error: ${JSON.stringify(error)}`,
      });
    }
    return new AirbyteConnectionStatusMessage({
      status: AirbyteConnectionStatus.SUCCEEDED,
    });
  }

  /**
   * Implements the Read operation from the Airbyte Specification. See
   * https://docs.airbyte.io/architecture/airbyte-specification.
   */
  async *read(
    config: Config,
    redactedConfig: AirbyteConfig,
    catalog: AirbyteConfiguredCatalog,
    state: AirbyteState
  ): AsyncGenerator<AirbyteMessage> {
    this.adjustLoggerLevel(config);

    this.logger.info(`Syncing ${this.name}`);
    yield new AirbyteSourceConfigMessage(
      {data: maybeCompressState(config, state)},
      redactedConfig,
      this.type,
      this.mode(config),
      ConnectorVersion
    );

    // TODO: assert all streams exist in the connector
    // get the streams once in case the connector needs to make any queries to
    // generate them
    const streamInstances = keyBy(this.streams(config), (s) => s.name);
    const configuredStreams = keyBy(catalog.streams, (s) => s.stream.name);
    const configuredStreamNames = Object.keys(configuredStreams);

    const missingStreams = configuredStreamNames.filter(
      (streamName) => !streamInstances[streamName]
    );
    if (missingStreams.length > 0) {
      throw new VError(
        `The requested stream(s) ${JSON.stringify(
          missingStreams
        )} were not found in the source. Available streams: ${Object.keys(
          streamInstances
        )}`
      );
    }

    const streamDeps: [string, string][] = [];
    for (const [streamName, stream] of Object.entries(streamInstances)) {
      if (!configuredStreamNames.includes(streamName)) {
        // The stream is not requested in the catalog, ignore it
        continue;
      }
      for (const dependency of stream.dependencies) {
        if (!configuredStreamNames.includes(dependency)) {
          // The stream dependency is not requested in the catalog, ignore it
          continue;
        }
        streamDeps.push([dependency, streamName]);
      }
    }

    // Requested streams in the order they should be processed
    const sortedStreams = toposort.array(configuredStreamNames, streamDeps);
    const totalStreams = sortedStreams.length;

    const failedStreams = [];
    let streamIndex = 0;
    for (const streamName of sortedStreams) {
      streamIndex++;
      const configuredStream = configuredStreams[streamName];
      let streamRecordCounter = 0;
      try {
        const streamInstance = streamInstances[streamName];
        const generator = this.readStream(
          streamInstance,
          configuredStream,
          state,
          pick(config, ['backfill']),
          streamIndex,
          totalStreams
        );

        for await (const message of generator) {
          if (isStateMessage(message)) {
            const msgState = maybeCompressState(config, message.state.data);
            if (isSourceStatusMessage(message)) {
              yield new AirbyteSourceStatusMessage(
                {data: msgState},
                message.sourceStatus,
                message.streamStatus
              );
            } else {
              yield new AirbyteStateMessage({data: msgState});
            }
          } else {
            if (message.type === AirbyteMessageType.RECORD) {
              streamRecordCounter++;
            }
            yield message;
          }
        }
        yield new AirbyteSourceStatusMessage(
          {data: maybeCompressState(config, state)},
          {status: 'RUNNING'},
          {
            name: streamName,
            status: 'SUCCESS',
            recordsEmitted: streamRecordCounter,
          }
        );
      } catch (e: any) {
        this.logger.error(
          `Encountered an error while reading stream ${streamName}: ${
            e.message ?? JSON.stringify(e)
          }`,
          e.stack
        );
        yield new AirbyteSourceStatusMessage(
          {data: maybeCompressState(config, state)},
          // TODO: complete error object with info from Source
          {
            status: 'ERRORED',
            message: {
              summary: e.message ?? JSON.stringify(e),
              code: 0, // placeholder
              action: 'Contact Faros Support', // placeholder
              type: 'ERROR',
            },
          },
          {
            name: streamName,
            status: 'ERROR',
            recordsEmitted: streamRecordCounter,
          }
        );
        failedStreams.push(streamName);
        continue;
      }
    }

    if (failedStreams.length > 0) {
      this.logger.error(
        `Encountered errors while reading stream(s): ${JSON.stringify(
          failedStreams
        )}`
      );
    } else {
      yield new AirbyteSourceStatusMessage(
        {data: maybeCompressState(config, state)},
        {status: 'SUCCESS'}
      );
    }

    this.logger.info(`Finished syncing ${this.name}`);
  }

  private async *readStream(
    streamInstance: AirbyteStreamBase,
    configuredStream: AirbyteConfiguredStream,
    connectorState: AirbyteState,
    config: PartialAirbyteConfig,
    streamIndex: number,
    totalStreams: number
  ): AsyncGenerator<AirbyteMessage> {
    const useIncremental =
      configuredStream.sync_mode === SyncMode.INCREMENTAL &&
      streamInstance.supportsIncremental &&
      !config.backfill;

    const recordGenerator = this.doReadStream(
      streamInstance,
      configuredStream,
      useIncremental ? SyncMode.INCREMENTAL : SyncMode.FULL_REFRESH,
      connectorState,
      config
    );

    let recordCounter = 0;
    const streamName = configuredStream.stream.name;
    const mode = useIncremental ? 'incremental' : 'full';
    this.logger.info(`Syncing ${streamName} stream (${streamIndex}/${totalStreams}) in ${mode} mode`);

    for await (const record of recordGenerator) {
      if (record.type === AirbyteMessageType.RECORD) {
        recordCounter++;
      }
      yield record;
    }
    this.logger.info(
      `Finished syncing ${streamName} stream. Read ${recordCounter} records`
    );
  }

  private async *doReadStream(
    streamInstance: AirbyteStreamBase,
    configuredStream: AirbyteConfiguredStream,
    syncMode: SyncMode,
    connectorState: AirbyteState,
    config: PartialAirbyteConfig
  ): AsyncGenerator<AirbyteMessage> {
    const streamName = configuredStream.stream.name;
    let streamState = {};
    if (config.backfill) {
      this.logger.info(
        `Running a backfill for ${streamName} stream. Stream state will be ignored and left unmodified.`
      );
    } else {
      streamState = connectorState[streamName] ?? {};
      this.logger.info(
        `Setting initial state of ${streamName} stream to ${JSON.stringify(
          streamState
        )}`
      );
    }

    const checkpointInterval = streamInstance.stateCheckpointInterval;
    if (checkpointInterval < 0) {
      throw new VError(
        `Checkpoint interval ${checkpointInterval} of ${streamName} stream must be a positive integer`
      );
    }
    const slices = streamInstance.streamSlices(
      syncMode,
      configuredStream.cursor_field,
      streamState
    );
    const failedSlices = [];
    let streamRecordCounter = 0;
    let processedSlices = 0;
    
    // Get total slice count for progress tracking
    const totalSlices = await streamInstance.getSliceCount(
      syncMode,
      configuredStream.cursor_field,
      streamState
    );
    
    await streamInstance.onBeforeRead();
    for await (const slice of slices) {
      processedSlices++;
      if (slice) {
        if (totalSlices !== undefined) {
          this.logger.info(
            `Started processing ${streamName} stream slice ${JSON.stringify(
              slice
            )} (${processedSlices}/${totalSlices})`
          );
        } else {
          this.logger.info(
            `Started processing ${streamName} stream slice #${processedSlices}: ${JSON.stringify(
              slice
            )}`
          );
        }
      }
      let sliceRecordCounter = 0;
      const records = streamInstance.readRecords(
        syncMode,
        configuredStream.cursor_field,
        slice,
        streamState
      );
      try {
        for await (const recordData of records) {
          sliceRecordCounter++;
          streamRecordCounter++;
          yield AirbyteRecord.make(streamName, recordData);
          if (!config.backfill) {
            streamState = streamInstance.getUpdatedState(
              streamState,
              recordData,
              slice
            );
            if (
              checkpointInterval &&
              sliceRecordCounter % checkpointInterval === 0
            ) {
              yield this.checkpointState(
                streamName,
                streamState,
                connectorState
              );
            }
          }
        }
        if (!config.backfill) {
          yield this.checkpointState(streamName, streamState, connectorState);
        }
        if (slice) {
          if (totalSlices !== undefined) {
            this.logger.info(
              `Finished processing ${streamName} stream slice ${JSON.stringify(
                slice
              )} (${processedSlices}/${totalSlices}). Read ${sliceRecordCounter} records`
            );
          } else {
            this.logger.info(
              `Finished processing ${streamName} stream slice #${processedSlices}: ${JSON.stringify(
                slice
              )}. Read ${sliceRecordCounter} records`
            );
          }
        }
      } catch (e: any) {
        failedSlices.push(slice);
        this.logger.error(
          `Encountered an error while processing ${streamName} stream slice ${JSON.stringify(
            slice
          )}: ${e.message ?? JSON.stringify(e)}. Emitted ${sliceRecordCounter} records before failure.`,
          e.stack
        );
        yield this.sliceFailureState(
          config,
          streamName,
          streamState,
          connectorState,
          streamRecordCounter,
          e
        );
        continue;
      }
    }
    await streamInstance.onAfterRead();
    if (failedSlices.length > 0) {
      this.logger.error(
        `Encountered errors while processing ${streamName} stream slice(s): ${JSON.stringify(
          failedSlices
        )}`
      );
    }
    if (!config.backfill) {
      this.logger.info(
        `Last recorded state of ${streamName} stream is ${JSON.stringify(
          streamState
        )}`
      );
    }

    const sliceFailurePct =
      processedSlices > 0 ? failedSlices.length / processedSlices : undefined;
    if (sliceFailurePct >= streamInstance.sliceErrorPctForFailure) {
      this.logger.error(
        `Exceeded slice failure threshold for ${streamName} stream:` +
          ` ${Math.floor(sliceFailurePct * 100)}% of slices -` +
          ` ${failedSlices.length} out of ${processedSlices} - have failed.` +
          ` Maximum threshold is ${streamInstance.sliceErrorPctForFailure * 100}%`
      );
      throw new VError(
        `Exceeded slice failure threshold for ${streamName} stream`
      );
    }
  }

  private checkpointState(
    streamName: string,
    streamState: any,
    connectorState: AirbyteState
  ): AirbyteStateMessage {
    connectorState[streamName] = streamState;
    return new AirbyteStateMessage({data: connectorState});
  }

  private sliceFailureState(
    config: PartialAirbyteConfig,
    streamName: string,
    streamState: any,
    connectorState: AirbyteState,
    streamRecordCount: number,
    error: Error
  ): AirbyteStateMessage {
    connectorState[streamName] = streamState;
    return new AirbyteSourceStatusMessage(
      {data: maybeCompressState(config, connectorState)},
      {
        status: 'RUNNING',
        // TODO: complete error object with info from Source
        message: {
          summary: error.message ?? JSON.stringify(error),
          code: 0, // placeholder
          action: 'Contact Faros Support', // placeholder
          type: 'ERROR',
        },
      },
      {
        name: streamName,
        status: 'ERROR',
        recordsEmitted: streamRecordCount,
      }
    );
  }

  private adjustLoggerLevel(config: Config) {
    if (config.debug) {
      this.logger.level = AirbyteLogLevel.DEBUG;
    }
  }
}

export function maybeCompressState(
  config: AirbyteConfig,
  state: AirbyteState
): AirbyteState {
  return config.compress_state === false ? state : Data.compress(state);
}
