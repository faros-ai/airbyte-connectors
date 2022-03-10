import fs from 'fs';
import path from 'path';

import {StreamName} from '../src/converters/converter';
import {ConverterRegistry as sut} from '../src/converters/converter-registry';

describe('converter registry', () => {
  function listDirs(source: string): string[] {
    return fs
      .readdirSync(source, {withFileTypes: true})
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
  }

  function listFiles(source: string): string[] {
    return fs
      .readdirSync(source, {withFileTypes: true})
      .filter((dirent) => dirent.isFile())
      .map((dirent) => dirent.name);
  }

  function listStreams(source: string): ReadonlyArray<StreamName> {
    const res = [];
    const dirs = listDirs(source);

    for (const dir of dirs) {
      for (const file of listFiles(`${source}/${dir}`)) {
        res.push(new StreamName(dir, path.basename(file, '.ts')));
      }
    }
    return res;
  }

  test('load all converters', async () => {
    const streams = listStreams('src/converters');

    for (const stream of streams) {
      const converter = sut.getConverter(stream);

      if (converter && converter.convert) {
        const streamName = converter.streamName.asString.toLowerCase();

        // Skip Okta Faros converter aliases
        if (streamName.startsWith('okta__faros')) continue;

        expect(streamName).toBe(stream.asString.toLowerCase());
        expect(converter.dependencies.length).toBeGreaterThanOrEqual(0);
        expect(converter.destinationModels.length).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('not fail on non-existent converter', async () => {
    const bogus = new StreamName('foo', 'bar');
    let error;
    const converter = sut.getConverter(bogus, (err) => {
      error = err;
    });
    expect(converter).toBeUndefined();
    expect(error).toBeDefined();
    expect(error.message).toBe(
      `Failed loading converter for stream foo__bar: Cannot find module './foo/bar' from 'src/converters/converter-registry.ts'`
    );
  });
});
