import {cloneDeep, keyBy} from 'lodash';
import VError from 'verror';

import {AirbyteLogger} from '../logger';
import {
  AirbyteCatalogMessage,
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteConfiguredStream,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusValue,
  AirbyteMessage,
  AirbyteMessageType,
  AirbyteRecord,
  AirbyteState,
  AirbyteStateMessage,
  SyncMode,
} from '../protocol';
import {AirbyteSource} from './source';
import {AirbyteStreamBase} from './streams/core';

/**
 * Aibyte Source base class providing
 */
export abstract class AirbyteAbstractSource extends AirbyteSource {
  constructor(protected readonly logger: AirbyteLogger) {
    super();
  }

  /**
   * @param config The user-provided configuration as specified by the source's
   * spec. This usually contains information required to check connection e.g.
   * tokens, secrets and keys etc.
   * @return A tuple of (boolean, VError). If boolean is true, then the
   * connection check is successful and we can connect to the underlying data
   * source using the provided configuration. Otherwise, the input config cannot
   * be used to connect to the underlying data source, and the VError should
   * describe what went wrong. The VError message will be displayed to the user.
   */
  abstract checkConnection(config: AirbyteConfig): Promise<[boolean, VError]>;

  /**
   * @param config The user-provided configuration as specified by the source's
   * spec. Any stream construction related operation should happen here.
   * @return A list of the streams in this source connector.
   */
  abstract streams(config: AirbyteConfig): AirbyteStreamBase[];

  /**
   * Source name
   */
  get name(): string {
    return this.constructor.name;
  }

  /**
   * Implements the Discover operation from the Airbyte Specification. See
   * https://docs.airbyte.io/architecture/airbyte-specification.
   */
  async discover(config: AirbyteConfig): Promise<AirbyteCatalogMessage> {
    const streams = this.streams(config).map((stream) =>
      stream.asAirbyteStream()
    );
    return new AirbyteCatalogMessage({streams});
  }

  /**
   * Implements the Check Connection operation from the Airbyte Specification.
   * See https://docs.airbyte.io/architecture/airbyte-specification.
   */
  async check(config: AirbyteConfig): Promise<AirbyteConnectionStatus> {
    try {
      const [succeeded, error] = await this.checkConnection(config);
      if (!succeeded) {
        return new AirbyteConnectionStatus({
          status: AirbyteConnectionStatusValue.FAILED,
          message: error.message,
        });
      }
    } catch (error) {
      return new AirbyteConnectionStatus({
        status: AirbyteConnectionStatusValue.FAILED,
        message:
          (error as Error).message ?? `Unknown error: ${JSON.stringify(error)}`,
      });
    }
    return new AirbyteConnectionStatus({
      status: AirbyteConnectionStatusValue.SUCCEEDED,
    });
  }

  /**
   * Implements the Read operation from the Airbyte Specification. See
   * https://docs.airbyte.io/architecture/airbyte-specification.
   */
  async *read(
    config: AirbyteConfig,
    catalog: AirbyteConfiguredCatalog,
    state?: AirbyteState
  ): AsyncGenerator<AirbyteMessage> {
    const connectorState = cloneDeep(state ?? {});
    this.logger.info(`Starting syncing ${this.name}`);
    // TODO: assert all streams exist in the connector
    // get the streams once in case the connector needs to make any queries to
    // generate them
    const streamInstances = keyBy(this.streams(config), (s) => s.name);
    for (const configuredStream of catalog.streams) {
      const streamInstance = streamInstances[configuredStream.stream.name];
      if (!streamInstance) {
        throw new Error(
          `The requested stream ${
            configuredStream.stream.name
          } was not found in the source. Available streams: ${Object.keys(
            streamInstances
          )}`
        );
      }
      try {
        const generator = this.readStream(
          streamInstance,
          configuredStream,
          connectorState
        );
        for await (const message of generator) {
          yield message;
        }
      } catch (error) {
        this.logger.error(
          `Encountered an exception while reading stream ${this.name}`
        );
        throw error;
      }
    }
    this.logger.info(`Finished syncing ${this.name}`);
  }

  private async *readStream(
    streamInstance: AirbyteStreamBase,
    configuredStream: AirbyteConfiguredStream,
    connectorState: AirbyteState
  ): AsyncGenerator<AirbyteMessage> {
    const useIncremental =
      configuredStream.sync_mode === SyncMode.INCREMENTAL &&
      streamInstance.supportsIncremental;

    const recordGenerator = useIncremental
      ? this.readIncremental(streamInstance, configuredStream, connectorState)
      : this.readFullRefresh(streamInstance, configuredStream);

    let recordCounter = 0;
    const streamName = configuredStream.stream.name;
    this.logger.info(`Syncing stream ${streamName}`);

    for await (const record of recordGenerator) {
      if (record.type === AirbyteMessageType.RECORD) {
        recordCounter++;
      }
      yield record;
    }
    this.logger.info(`Read ${recordCounter} records from ${streamName} stream`);
  }

  private async *readIncremental(
    streamInstance: AirbyteStreamBase,
    configuredStream: AirbyteConfiguredStream,
    connectorState: AirbyteState
  ): AsyncGenerator<AirbyteMessage> {
    const streamName = configuredStream.stream.name;
    let streamState = connectorState[streamName] ?? {};
    if (streamState) {
      this.logger.info(
        `Setting state of ${streamName} stream to ${JSON.stringify(
          streamState
        )}`
      );
    }

    const checkpointInterval = streamInstance.stateCheckpointInterval;
    const slices = streamInstance.streamSlices(
      SyncMode.INCREMENTAL,
      configuredStream.cursor_field,
      streamState
    );
    for await (const slice of slices) {
      let recordCounter = 0;
      const records = streamInstance.readRecords(
        SyncMode.INCREMENTAL,
        configuredStream.cursor_field,
        slice,
        streamState
      );
      for await (const recordData of records) {
        recordCounter++;
        yield AirbyteRecord.make(streamName, recordData);
        streamState = streamInstance.getUpdatedState(streamState, recordData);
        if (checkpointInterval && recordCounter % checkpointInterval === 0) {
          yield this.checkpointState(streamName, streamState, connectorState);
        }
      }
      yield this.checkpointState(streamName, streamState, connectorState);
    }
  }

  private async *readFullRefresh(
    streamInstance: AirbyteStreamBase,
    configuredStream: AirbyteConfiguredStream
  ): AsyncGenerator<AirbyteMessage> {
    const slices = streamInstance.streamSlices(
      SyncMode.FULL_REFRESH,
      configuredStream.cursor_field
    );
    for await (const slice of slices) {
      const records = streamInstance.readRecords(
        SyncMode.FULL_REFRESH,
        configuredStream.cursor_field,
        slice
      );
      for await (const record of records) {
        yield AirbyteRecord.make(configuredStream.stream.name, record);
      }
    }
  }

  private checkpointState(
    streamName: string,
    streamState: any,
    connectorState: AirbyteState
  ): AirbyteStateMessage {
    this.logger.info(
      `Setting state of ${streamName} stream to ${JSON.stringify(streamState)}`
    );
    connectorState[streamName] = streamState;
    return new AirbyteStateMessage({data: connectorState});
  }
}
