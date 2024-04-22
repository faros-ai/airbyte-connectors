import path from 'path';

import {redactConfig, redactConfigAsString, SpecLoader} from '../src';

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
});
