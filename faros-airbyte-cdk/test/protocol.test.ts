import {
  AirbyteLog,
  AirbyteLogLevel,
  AirbyteStateMessage,
  AirbyteStateType,
} from '../src/protocol';
import {Data} from '../src/utils';

describe('airbyte protocol', () => {
  describe('airbyte log message', () => {
    it('should replace newlines with double spaces', () => {
      const message =
        'Encountered an error: Request failed due to following errors:' +
        '\n - Error 1\n - Error 2\n - Error 3';
      const log = AirbyteLog.make(AirbyteLogLevel.ERROR, message);
      expect(log.log.message).toBe(message.replace(/\n/g, '  '));
    });
  });

  describe('AirbyteStateMessage', () => {
    it('should always compress uncompressed state in GLOBAL format with shared_state', () => {
      const state = {
        stream1: {cursor: '2025-01-01'},
        stream2: {cursor: '2025-01-02'},
      };
      const msg = new AirbyteStateMessage(state);

      expect(msg.state.type).toBe(AirbyteStateType.GLOBAL);
      expect(msg.state.global).toBeDefined();
      expect(msg.state.global!.shared_state).toBeDefined();
      expect(msg.state.global!.shared_state.format).toBe('base64/gzip');
      expect(msg.state.global!.stream_states).toEqual([]);

      // Verify compressed state is decompressible to original
      const decompressed = Data.decompress(msg.state.global!.shared_state);
      expect(decompressed).toEqual(state);
    });

    it('should keep already compressed state as-is in GLOBAL format with shared_state', () => {
      const originalState = {
        stream1: {cursor: '2025-01-01'},
        stream2: {cursor: '2025-01-02'},
      };
      const compressedState = Data.compress(originalState);
      const msg = new AirbyteStateMessage(compressedState);

      expect(msg.state.type).toBe(AirbyteStateType.GLOBAL);
      expect(msg.state.global).toBeDefined();
      expect(msg.state.global!.shared_state).toEqual(compressedState);
      expect(msg.state.global!.stream_states).toEqual([]);
    });

    it('should handle empty state', () => {
      const msg = new AirbyteStateMessage({});

      expect(msg.state).toEqual({
        type: AirbyteStateType.GLOBAL,
        global: {
          shared_state: {},
          stream_states: [],
        },
      });
    });

    it('should handle undefined state', () => {
      const msg = new AirbyteStateMessage(undefined as any);

      expect(msg.state).toEqual({
        type: AirbyteStateType.GLOBAL,
        global: {
          shared_state: {},
          stream_states: [],
        },
      });
    });

    it('should handle null state', () => {
      const msg = new AirbyteStateMessage(null as any);

      expect(msg.state).toEqual({
        type: AirbyteStateType.GLOBAL,
        global: {
          shared_state: {},
          stream_states: [],
        },
      });
    });

    it('compressed state in shared_state should be decompressible', () => {
      const originalState = {
        stream1: {cursor: '2025-01-01'},
        stream2: {cursor: '2025-01-02'},
      };
      const compressedState = Data.compress(originalState);
      const msg = new AirbyteStateMessage(compressedState);

      const decompressed = Data.decompress(msg.state.global!.shared_state);
      expect(decompressed).toEqual(originalState);
    });
  });
});
