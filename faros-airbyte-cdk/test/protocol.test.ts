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
    it('should output non-compressed state in GLOBAL format with stream_states', () => {
      const state = {
        stream1: {cursor: '2025-01-01'},
        stream2: {cursor: '2025-01-02'},
      };
      const msg = new AirbyteStateMessage(state);

      expect(msg.state.type).toBe(AirbyteStateType.GLOBAL);
      expect(msg.state.global).toBeDefined();
      expect(msg.state.global!.shared_state).toBeUndefined();
      expect(msg.state.global!.stream_states).toHaveLength(2);

      const streamNames = msg.state.global!.stream_states.map(
        (s) => s.stream_descriptor.name
      );
      expect(streamNames).toContain('stream1');
      expect(streamNames).toContain('stream2');

      const stream1State = msg.state.global!.stream_states.find(
        (s) => s.stream_descriptor.name === 'stream1'
      );
      expect(stream1State!.stream_state).toEqual({cursor: '2025-01-01'});
    });

    it('should output compressed state in GLOBAL format with shared_state', () => {
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

      expect(msg.state.type).toBe(AirbyteStateType.GLOBAL);
      expect(msg.state.global!.stream_states).toEqual([]);
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
