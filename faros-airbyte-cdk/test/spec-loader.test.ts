import path from 'path';

import {SpecLoader} from '../src/spec-loader';

const BASE_RESOURCES_DIR = path.join(__dirname, 'resources');

describe('spec loader', () => {
  test('resolves references', async () => {
    expect(
      await SpecLoader.loadSpec(path.join(BASE_RESOURCES_DIR, 'spec.json'))
    ).toMatchSnapshot();
  });

  test('throws when fails to resolve references', async () => {
    expect(() =>
      SpecLoader.loadSpec(path.join(BASE_RESOURCES_DIR, 'spec-bad-ref.json'))
    ).rejects.toThrowError(/^Failed to load spec references/);
  });
});
