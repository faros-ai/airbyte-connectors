import path from 'path';

import {
  addSourceCommonProperties,
  AirbyteSpec,
  Data,
  redactConfig,
  redactConfigAsString,
  SpecLoader,
  State,
} from '../src';

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
});

describe('State', () => {
  const testState = {
    stream1: {cursor: '2024-01-01'},
    stream2: {cursor: '2024-02-01'},
  };

  describe('decode', () => {
    test('should handle plain JSON state', () => {
      const result = State.decode(testState);
      expect(result).toEqual(testState);
    });

    test('should handle legacy compressed state', () => {
      const compressed = Data.compress(testState);
      const result = State.decode(compressed);
      expect(result).toEqual(testState);
    });

    test('should handle GLOBAL compressed state', () => {
      const globalState = {
        type: 'GLOBAL',
        global: {
          shared_state: Data.compress(testState),
          stream_states: [],
        },
      };
      const result = State.decode(globalState);
      expect(result).toEqual(testState);
    });

    test('should handle GLOBAL state with plain JSON shared_state', () => {
      const globalState = {
        type: 'GLOBAL',
        global: {
          shared_state: testState,
          stream_states: [],
        },
      };
      const result = State.decode(globalState);
      expect(result).toEqual(testState);
    });

    test('should return undefined for undefined input', () => {
      expect(State.decode(undefined)).toBeUndefined();
    });

    test('should return null for null input', () => {
      expect(State.decode(null)).toBeNull();
    });
  });

  describe('encode', () => {
    test('should produce GLOBAL format with compressed shared_state', () => {
      const result = State.encode(testState);

      expect(result).toHaveProperty('type', 'GLOBAL');
      expect(result).toHaveProperty('global');
      expect(result.global).toHaveProperty('shared_state');
      expect(result.global).toHaveProperty('stream_states', []);
      expect(result.global.shared_state).toHaveProperty('format', 'base64/gzip');
      expect(result.global.shared_state).toHaveProperty('data');
    });

    test('should produce state that can be read back via decode', () => {
      const output = State.encode(testState);
      const result = State.decode(output);
      expect(result).toEqual(testState);
    });

    test('should handle empty state', () => {
      const result = State.encode({});
      expect(result).toHaveProperty('type', 'GLOBAL');
      expect(State.decode(result)).toEqual({});
    });
  });
});
