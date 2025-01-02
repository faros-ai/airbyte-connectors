import {Dictionary} from 'ts-essentials';
import VError from 'verror';

import {
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteLogger,
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

const logger = new AirbyteLogger();
class TestStream extends AirbyteStreamBase {
  constructor(
    logger: AirbyteLogger,
    private readonly numSlices: number,
    private readonly numFailedSlices: number,
    private readonly _sliceErrorPctForFailure: number = 1
  ) {
    super(logger);
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
});
