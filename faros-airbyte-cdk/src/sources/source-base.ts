import {keyBy, pick} from 'lodash';
import toposort from 'toposort';
import VError from 'verror';

import {NonFatalError} from '../errors';
import {AirbyteLogger} from '../logger';
import {
  AirbyteCatalogMessage,
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteConfiguredStream,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
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
import {AirbyteSource} from './source';
import {State} from './state';
import {AirbyteStreamBase} from './streams/stream-base';

type PartialAirbyteConfig = Pick<
  AirbyteConfig,
  'backfill' | 'max_slice_failures'
>;

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
    this.logger.info(`Syncing ${this.name}`);
    yield new AirbyteSourceConfigMessage(
      {data: maybeCompressState(config, state)},
      redactedConfig,
      this.type,
      this.mode(config)
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

    const failedStreams = [];
    for (const streamName of sortedStreams) {
      const configuredStream = configuredStreams[streamName];
      try {
        const streamInstance = streamInstances[streamName];
        const generator = this.readStream(
          streamInstance,
          configuredStream,
          state,
          pick(config, ['backfill', 'max_slice_failures'])
        );

        for await (const message of generator) {
          if (isStateMessage(message)) {
            const msgState = maybeCompressState(config, message.state.data);
            if (isSourceStatusMessage(message)) {
              yield new AirbyteSourceStatusMessage(
                {data: msgState},
                message.sourceStatus
              );
            } else {
              yield new AirbyteStateMessage({data: msgState});
            }
          } else {
            yield message;
          }
        }
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
          }
        );

        if (config.max_stream_failures == null) {
          throw e;
        }
        failedStreams.push(streamName);
        // -1 means unlimited allowed stream failures
        if (
          config.max_stream_failures !== -1 &&
          failedStreams.length > config.max_stream_failures
        ) {
          this.logger.error(
            `Exceeded maximum number of allowed stream failures: ${config.max_stream_failures}`
          );
          break;
        }
      }
    }

    if (failedStreams.length > 0) {
      throw new VError(
        `Encountered an error while reading stream(s): ${JSON.stringify(
          failedStreams
        )}`
      );
    }

    yield new AirbyteSourceStatusMessage(
      {data: maybeCompressState(config, state)},
      {status: 'SUCCESS'}
    );
    this.logger.info(`Finished syncing ${this.name}`);
  }

  private async *readStream(
    streamInstance: AirbyteStreamBase,
    configuredStream: AirbyteConfiguredStream,
    connectorState: AirbyteState,
    config: PartialAirbyteConfig
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
    this.logger.info(`Syncing ${streamName} stream in ${mode} mode`);

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
    let streamState =
      syncMode === SyncMode.INCREMENTAL ? connectorState[streamName] ?? {} : {};
    if (config.backfill) {
      this.logger.info(
        `Running a backfill for ${streamName} stream. Stream state will be ignored and left unmodified.`
      );
    } else {
      this.logger.info(
        `Setting initial state of ${streamName} stream to ${JSON.stringify(
          streamState
        )}`
      );
    }

    const checkpointInterval = streamInstance.stateCheckpointInterval;
    if (checkpointInterval < 0) {
      throw new VError(
        `Checkpoint interval ${checkpointInterval}of ${streamName} stream must be a positive integer`
      );
    }
    const slices = streamInstance.streamSlices(
      syncMode,
      configuredStream.cursor_field,
      streamState
    );
    const failedSlices = [];
    for await (const slice of slices) {
      if (slice) {
        this.logger.info(
          `Started processing ${streamName} stream slice ${JSON.stringify(
            slice
          )}`
        );
      }
      let recordCounter = 0;
      const records = streamInstance.readRecords(
        syncMode,
        configuredStream.cursor_field,
        slice,
        streamState
      );
      try {
        for await (const recordData of records) {
          recordCounter++;
          yield AirbyteRecord.make(streamName, recordData);
          if (!config.backfill) {
            streamState = streamInstance.getUpdatedState(
              streamState,
              recordData,
              slice
            );
            if (
              checkpointInterval &&
              recordCounter % checkpointInterval === 0
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
          this.logger.info(
            `Finished processing ${streamName} stream slice ${JSON.stringify(
              slice
            )}. Read ${recordCounter} records`
          );
        }
      } catch (e: any) {
        if (e instanceof NonFatalError) {
          this.logger.warn(
            `Encountered a non-fatal error while processing ${streamName} stream slice ${JSON.stringify(
              slice
            )}: ${e.message ?? JSON.stringify(e)}`,
            e.stack
          );
          yield this.errorState(streamName, streamState, connectorState, e);
          continue;
        }

        if (!slice || config.max_slice_failures == null) {
          throw e;
        }
        failedSlices.push(slice);
        this.logger.error(
          `Encountered an error while processing ${streamName} stream slice ${JSON.stringify(
            slice
          )}: ${e.message ?? JSON.stringify(e)}`,
          e.stack
        );
        yield this.errorState(streamName, streamState, connectorState, e);
        // -1 means unlimited allowed slice failures
        if (
          config.max_slice_failures !== -1 &&
          failedSlices.length > config.max_slice_failures
        ) {
          this.logger.error(
            `Exceeded maximum number of allowed slice failures: ${config.max_slice_failures}`
          );
          break;
        }
      }
    }
    if (failedSlices.length > 0) {
      throw new VError(
        `Encountered an error while processing ${streamName} stream slice(s): ${JSON.stringify(
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
  }

  private checkpointState(
    streamName: string,
    streamState: any,
    connectorState: AirbyteState
  ): AirbyteStateMessage {
    connectorState[streamName] = streamState;
    return new AirbyteStateMessage({data: connectorState});
  }

  private errorState(
    streamName: string,
    streamState: any,
    connectorState: AirbyteState,
    error: Error
  ): AirbyteStateMessage {
    connectorState[streamName] = streamState;
    return new AirbyteSourceStatusMessage(
      {data: connectorState},
      {
        status: error instanceof NonFatalError ? 'RUNNING' : 'ERRORED',
        // TODO: complete error object with info from Source
        message: {
          summary: error.message ?? JSON.stringify(error),
          code: 0, // placeholder
          action: 'Contact Faros Support', // placeholder
          type: 'ERROR',
        },
      }
    );
  }
}

export function maybeCompressState(
  config: AirbyteConfig,
  state: AirbyteState
): AirbyteState {
  return config.compress_state === false ? state : State.compress(state);
}
