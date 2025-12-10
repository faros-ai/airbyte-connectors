import path from 'path';

import {
  addSourceCommonProperties,
  AirbyteSpec,
  redactConfig,
  redactConfigAsString,
  SpecLoader,
} from '../src';
import {AirbyteStateType} from '../src/protocol';
import {Data, isCompressedState, parseStateInput} from '../src/utils';

const BASE_RESOURCES_DIR = path.join(__dirname, 'resources');

describe('utils', () => {
  test('redact config', async () => {
    const spec = await SpecLoader.loadSpec(
      path.join(BASE_RESOURCES_DIR, 'spec.json')
    );

    const cfg = {
      prop1: {
        name: 'John Doe',
        token: 'abc',
      },
    };

    const expected = {prop1: {name: 'John Doe', token: 'REDACTED'}};
    expect(redactConfig(cfg, spec)).toEqual(expected);
    expect(redactConfigAsString(cfg, spec)).toEqual(JSON.stringify(expected));
  });

  test('redact config with string array', async () => {
    const spec = await SpecLoader.loadSpec(
      path.join(BASE_RESOURCES_DIR, 'spec.json')
    );

    const cfg = {
      prop1: {
        name: 'John Doe',
        token_array: ['abc', 'def'],
      },
    };

    const expected = {
      prop1: {name: 'John Doe', token_array: ['REDACTED', 'REDACTED']},
    };
    expect(redactConfig(cfg, spec)).toEqual(expected);
    expect(redactConfigAsString(cfg, spec)).toEqual(JSON.stringify(expected));
  });

  test('redact config with object array', async () => {
    const spec = await SpecLoader.loadSpec(
      path.join(BASE_RESOURCES_DIR, 'spec.json')
    );

    const cfg = {
      prop1: {
        name: 'John Doe',
        object_token_array: [{token: 'abc'}, {token: 'def'}],
      },
    };

    const expected = {
      prop1: {
        name: 'John Doe',
        object_token_array: [{token: 'REDACTED'}, {token: 'REDACTED'}],
      },
    };
    expect(redactConfig(cfg, spec)).toEqual(expected);
    expect(redactConfigAsString(cfg, spec)).toEqual(JSON.stringify(expected));
  });

  test('add source common properties', () => {
    const spec = new AirbyteSpec({
      connectionSpecification: {
        properties: {
          prop1: {
            type: 'string',
          },
        },
      },
    });

    const updatedSpec = addSourceCommonProperties(spec);
    expect(updatedSpec).toMatchSnapshot();
  });

  describe('isCompressedState', () => {
    test('returns true for compressed state', () => {
      const compressedState = {format: 'base64/gzip', data: 'H4sIAAAA...'};
      expect(isCompressedState(compressedState)).toBe(true);
    });

    test('returns false for non-compressed state', () => {
      const state = {stream1: {cursor: '2025-01-01'}};
      expect(isCompressedState(state)).toBe(false);
    });

    test('returns false for state with only format field', () => {
      const state = {format: 'base64/gzip', cursor: '2025-01-01'};
      expect(isCompressedState(state)).toBe(false);
    });

    test('returns false for state with only data field', () => {
      const state = {data: 'H4sIAAAA...', cursor: '2025-01-01'};
      expect(isCompressedState(state)).toBe(false);
    });

    test('returns false for null', () => {
      expect(isCompressedState(null as any)).toBe(false);
    });
  });

  describe('parseStateInput', () => {
    test('returns empty object for null input', () => {
      expect(parseStateInput(null)).toEqual({});
    });

    test('returns empty object for undefined input', () => {
      expect(parseStateInput(undefined)).toEqual({});
    });

    test('parses legacy non-compressed state', () => {
      const legacyState = {
        stream1: {cursor: '2025-01-01'},
        stream2: {cursor: '2025-01-02'},
      };
      expect(parseStateInput(legacyState)).toEqual(legacyState);
    });

    test('parses legacy compressed state', () => {
      const originalState = {
        stream1: {cursor: '2025-01-01'},
        stream2: {cursor: '2025-01-02'},
      };
      const compressedState = Data.compress(originalState);
      expect(parseStateInput(compressedState)).toEqual(originalState);
    });

    test('parses GLOBAL non-compressed state returns empty (non-compressed not expected)', () => {
      // GLOBAL state should always be compressed. Non-compressed GLOBAL format
      // is not expected and will return an empty object.
      const globalState = [
        {
          type: AirbyteStateType.GLOBAL,
          global: {
            shared_state: {},
            stream_states: [
              {
                stream_descriptor: {name: 'stream1'},
                stream_state: {cursor: '2025-01-01'},
              },
              {
                stream_descriptor: {name: 'stream2'},
                stream_state: {cursor: '2025-01-02'},
              },
            ],
          },
        },
      ];
      expect(parseStateInput(globalState)).toEqual({});
    });

    test('parses GLOBAL compressed state from shared_state', () => {
      const originalState = {
        stream1: {cursor: '2025-01-01'},
        stream2: {cursor: '2025-01-02'},
      };
      const compressedState = Data.compress(originalState);
      const globalState = [
        {
          type: AirbyteStateType.GLOBAL,
          global: {
            shared_state: compressedState,
            stream_states: [],
          },
        },
      ];
      expect(parseStateInput(globalState)).toEqual(originalState);
    });

    test('parses GLOBAL state with empty stream_states', () => {
      const globalState = [
        {
          type: AirbyteStateType.GLOBAL,
          global: {
            shared_state: {},
            stream_states: [],
          },
        },
      ];
      expect(parseStateInput(globalState)).toEqual({});
    });
  });
});
