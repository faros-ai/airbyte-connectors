import {Dictionary} from 'ts-essentials';
import VError from 'verror';

import {
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteLogger,
  AirbyteSourceBase,
  AirbyteSpec,
  SyncMode,
} from '../../src';
import {
  AirbyteStreamBase,
  StreamKey,
} from '../../src/sources/streams/stream-base';

const logger = new AirbyteLogger();

class TestStreamForProgress extends AirbyteStreamBase {
  constructor(
    logger: AirbyteLogger,
    private readonly streamName: string,
    private readonly numSlices: number
  ) {
    super(logger);
  }

  get name(): string {
    return this.streamName;
  }

  getJsonSchema(): Dictionary<any, string> {
    return {};
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *streamSlices(): AsyncGenerator<Dictionary<any>> {
    for (let i = 0; i < this.numSlices; i++) {
      yield {sliceId: i};
    }
  }

  async *readRecords(): AsyncGenerator<Dictionary<any>> {
    yield {id: 'test'};
  }
}

class TestSourceForProgress extends AirbyteSourceBase<AirbyteConfig> {
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
    return new AirbyteSpec({connectionSpecification: {}});
  }
  async checkConnection(_: AirbyteConfig): Promise<[boolean, VError]> {
    return [true, undefined];
  }

  streams(): AirbyteStreamBase[] {
    return this._streams;
  }
}

describe('Progress Logging', () => {
  it('should log stream and slice progress for multiple streams', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    
    const streams = [
      new TestStreamForProgress(logger, 'stream_one', 2),
      new TestStreamForProgress(logger, 'stream_two', 1),
      new TestStreamForProgress(logger, 'stream_three', 3)
    ];
    
    const source = new TestSourceForProgress(logger, streams);
    const config = {};
    const configuredCatalog: AirbyteConfiguredCatalog = {
      streams: source.streams().map((stream) => ({
        stream: stream.asAirbyteStream(),
        sync_mode: SyncMode.FULL_REFRESH,
      })),
    };
    const state = {};
    
    const messages = source.read(config, config, configuredCatalog, state);
    
    for await (const msg of messages) {
      // Collect messages to trigger logging
    }
    
    const logOutput = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    
    // Check stream progress logging
    expect(logOutput).toContain('Running stream stream_one, 1 out of 3 total');
    expect(logOutput).toContain('Running stream stream_two, 2 out of 3 total');
    expect(logOutput).toContain('Running stream stream_three, 3 out of 3 total');
    
    // Check slice progress logging
    expect(logOutput).toContain('Running slice {\\\"sliceId\\\":0}, 1 out of unknown total');
    expect(logOutput).toContain('Running slice {\\\"sliceId\\\":1}, 2 out of unknown total');
    
    consoleSpy.mockRestore();
  });

  it('should handle edge case with empty stream (no slices)', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    
    const streams = [
      new TestStreamForProgress(logger, 'empty_stream', 0)
    ];
    
    const source = new TestSourceForProgress(logger, streams);
    const config = {};
    const configuredCatalog: AirbyteConfiguredCatalog = {
      streams: source.streams().map((stream) => ({
        stream: stream.asAirbyteStream(),
        sync_mode: SyncMode.FULL_REFRESH,
      })),
    };
    const state = {};
    
    const messages = source.read(config, config, configuredCatalog, state);
    
    for await (const msg of messages) {
      // Collect messages to trigger logging
    }
    
    const logOutput = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    
    // Check stream progress logging
    expect(logOutput).toContain('Running stream empty_stream, 1 out of 1 total');
    
    // Check that no slice progress logging occurs since there are no slices
    expect(logOutput).not.toContain('Running slice');
    
    consoleSpy.mockRestore();
  });
});