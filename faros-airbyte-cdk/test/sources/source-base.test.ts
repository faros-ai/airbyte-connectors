import {Dictionary} from 'ts-essentials';
import VError from 'verror';

import {
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteLog,
  AirbyteLogLevel,
  AirbyteLogger,
  AirbyteMessage,
  AirbyteMessageType,
  AirbyteRecord,
  AirbyteSourceBase,
  AirbyteSpec,
  isSourceStatusMessage,
  SyncMode,
} from '../../src';
import {
  AirbyteStreamBase,
  StreamKey,
} from '../../src/sources/streams/stream-base';

class CollectingLogger extends AirbyteLogger {
  public readonly logs: {level: AirbyteLogLevel; message: string}[] = [];

  override write(msg: AirbyteMessage): void {
    if (msg.type === AirbyteMessageType.LOG) {
      const logMessage = msg as AirbyteLog;
      this.logs.push({
        level: logMessage.log.level,
        message: logMessage.log.message,
      });
    }
  }
}

const logger = new AirbyteLogger();
class TestStream extends AirbyteStreamBase {
  constructor(
    logger: AirbyteLogger,
    private readonly numSlices: number,
    private readonly numFailedSlices: number,
    private readonly _sliceErrorPctForFailure: number = 1,
    private readonly streamName = 'test_stream'
  ) {
    super(logger);
  }
  override get name(): string {
    return this.streamName;
  }
  getJsonSchema(): Dictionary<any, string> {
    return {};
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  get sliceErrorPctForFailure(): number {
    return this._sliceErrorPctForFailure;
  }

  async *streamSlices(): AsyncGenerator<Dictionary<any>> {
    if (this.numSlices <= 0) {
      throw new Error('Failed to get slices');
    }
    for (let i = 0; i < this.numSlices; i++) {
      yield {sliceId: i};
    }
  }

  async *readRecords(
    _: SyncMode,
    __?: string[],
    streamSlice?: Dictionary<any>
  ): AsyncGenerator<Dictionary<any>> {
    if (streamSlice.sliceId < this.numFailedSlices) {
      throw new Error('Failed to read records');
    }
    yield {id: 'test'};
  }
}

class TestSource extends AirbyteSourceBase<AirbyteConfig> {
  constructor(
    logger: AirbyteLogger,
    private readonly _streams: AirbyteStreamBase[]
  ) {
    super(logger);
  }

  get type(): string {
    return 'example';
  }
  async spec(): Promise<AirbyteSpec> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return new AirbyteSpec({connectionSpecification: {}});
  }
  async checkConnection(_: AirbyteConfig): Promise<[boolean, VError]> {
    return [true, undefined];
  }

  streams(): AirbyteStreamBase[] {
    return this._streams;
  }
}

class NoSliceStream extends AirbyteStreamBase {
  constructor(logger: AirbyteLogger, private readonly streamName: string) {
    super(logger);
  }

  override get name(): string {
    return this.streamName;
  }

  getJsonSchema(): Dictionary<any, string> {
    return {};
  }

  get primaryKey(): StreamKey | undefined {
    return undefined;
  }

  async *streamSlices(): AsyncGenerator<Dictionary<any> | undefined> {
    // Intentionally yield no slices
  }

  async *readRecords(): AsyncGenerator<Dictionary<any>> {
    throw new Error('readRecords should not be called when no slices exist');
  }
}

describe('AirbyteSourceBase', () => {
  async function testRead(
    stream: AirbyteStreamBase,
    expectedSliceFailures: number,
    expectedSyncFailureMessages: number
  ) {
    const source = new TestSource(logger, [stream]);
    const config = {};
    const configuredCatalog: AirbyteConfiguredCatalog = {
      streams: source.streams().map((stream) => ({
        stream: stream.asAirbyteStream(),
        sync_mode: SyncMode.FULL_REFRESH,
      })),
    };
    const state = {};
    const messages = source.read(config, config, configuredCatalog, state);
    let sliceFailureMsgCount = 0;
    let syncFailureMsgCount = 0;
    let syncSuccessMsgCount = 0;
    for await (const msg of messages) {
      if (msg.type === AirbyteMessageType.RECORD) {
        expect((msg as AirbyteRecord).record.data).toEqual({id: 'test'});
      } else if (isSourceStatusMessage(msg)) {
        if (
          msg.sourceStatus.status === 'RUNNING' &&
          msg.streamStatus?.status === 'ERROR'
        ) {
          sliceFailureMsgCount++;
        }
        if (msg.sourceStatus.status === 'ERRORED') {
          syncFailureMsgCount++;
        }
        if (msg.sourceStatus.status === 'SUCCESS') {
          syncSuccessMsgCount++;
        }
      }
    }
    expect(sliceFailureMsgCount).toEqual(expectedSliceFailures);
    expect(syncFailureMsgCount).toEqual(expectedSyncFailureMessages);
    expect(syncSuccessMsgCount).toEqual(expectedSyncFailureMessages ? 0 : 1);
  }

  it('should process a stream that successfully runs all slices', async () => {
    await testRead(new TestStream(logger, 5, 0), 0, 0);
  });

  it('should process a stream that fails some slices', async () => {
    await testRead(new TestStream(logger, 5, 2), 2, 0);
  });

  it('should process a stream that fails all slices', async () => {
    await testRead(new TestStream(logger, 5, 5), 5, 1);
  });

  it('should process a stream with a custom slice failure threshold', async () => {
    await testRead(new TestStream(logger, 5, 2, 0.6), 2, 0);
  });

  it('should process a stream that exceeds its custom slice failure threshold', async () => {
    await testRead(new TestStream(logger, 5, 3, 0.6), 3, 1);
  });

  it('should handle a stream that fails to get slices', async () => {
    await testRead(new TestStream(logger, 0, 0), 0, 1);
  });

  it('logs stream progress across multiple streams', async () => {
    const progressLogger = new CollectingLogger();
    const streams = [
      new TestStream(progressLogger, 1, 0, 1, 'alpha_stream'),
      new TestStream(progressLogger, 1, 0, 1, 'beta_stream'),
    ];
    const source = new TestSource(progressLogger, streams);
    const config = {};
    const configuredCatalog: AirbyteConfiguredCatalog = {
      streams: source.streams().map((stream) => ({
        stream: stream.asAirbyteStream(),
        sync_mode: SyncMode.FULL_REFRESH,
      })),
    };

    const state = {};
    const messages = source.read(config, config, configuredCatalog, state);
    for await (const _ of messages) {
      // Drain generator
    }

    const infoLogs = progressLogger.logs
      .filter((log) => log.level === AirbyteLogLevel.INFO)
      .map((log) => log.message);

    const streamProgressLogs = infoLogs.filter((message) =>
      message.startsWith('Stream progress')
    );
    expect(streamProgressLogs).toEqual([
      'Stream progress 1/2: alpha_stream (first slice {"sliceId":0})',
      'Stream progress 2/2: beta_stream (first slice {"sliceId":0})',
    ]);

    const sliceProgressLogs = infoLogs.filter((message) =>
      message.startsWith('Completed slice')
    );
    expect(sliceProgressLogs).toEqual([
      'Completed slice 1 for stream alpha_stream ({"sliceId":0})',
      'Completed slice 1 for stream beta_stream ({"sliceId":0})',
    ]);
  });

  it('logs slice completion counts for multi-slice streams', async () => {
    const progressLogger = new CollectingLogger();
    const stream = new TestStream(progressLogger, 3, 0, 1, 'gamma_stream');
    const source = new TestSource(progressLogger, [stream]);
    const config = {};
    const configuredCatalog: AirbyteConfiguredCatalog = {
      streams: source.streams().map((stream) => ({
        stream: stream.asAirbyteStream(),
        sync_mode: SyncMode.FULL_REFRESH,
      })),
    };
    const state = {};
    const messages = source.read(config, config, configuredCatalog, state);
    for await (const _ of messages) {
      // Drain generator
    }

    const sliceProgressLogs = progressLogger.logs
      .filter(
        (log) =>
          log.level === AirbyteLogLevel.INFO &&
          log.message.startsWith('Completed slice')
      )
      .map((log) => log.message);

    expect(sliceProgressLogs).toEqual([
      'Completed slice 1 for stream gamma_stream ({"sliceId":0})',
      'Completed slice 2 for stream gamma_stream ({"sliceId":1})',
      'Completed slice 3 for stream gamma_stream ({"sliceId":2})',
    ]);
  });

  it('logs when a stream has no slices', async () => {
    const progressLogger = new CollectingLogger();
    const stream = new NoSliceStream(progressLogger, 'empty_stream');
    const source = new TestSource(progressLogger, [stream]);
    const config = {};
    const configuredCatalog: AirbyteConfiguredCatalog = {
      streams: source.streams().map((stream) => ({
        stream: stream.asAirbyteStream(),
        sync_mode: SyncMode.FULL_REFRESH,
      })),
    };
    const state = {};
    const messages = source.read(config, config, configuredCatalog, state);
    for await (const _ of messages) {
      // Drain generator
    }

    const infoLogs = progressLogger.logs
      .filter((log) => log.level === AirbyteLogLevel.INFO)
      .map((log) => log.message);

    const noSliceLog = infoLogs.filter((message) =>
      message.startsWith('Stream progress')
    );
    expect(noSliceLog).toEqual([
      'Stream progress 1/1: empty_stream (no slices to process)',
    ]);
  });
});
