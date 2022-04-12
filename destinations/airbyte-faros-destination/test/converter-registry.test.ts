import {AirbyteRecord} from 'faros-airbyte-cdk';
import fs from 'fs';
import path from 'path';

import {
  Converter,
  ConverterTyped,
  DestinationRecord,
  DestinationRecordTyped,
  StreamContext,
  StreamName,
} from '../src/converters/converter';
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

  test('add a custom converter class and load it', async () => {
    class CustomConverter extends Converter {
      source = 'Custom';
      destinationModels = ['test_Model'];
      id(record: AirbyteRecord): string {
        return record.record.data.id;
      }
      async convert(
        record: AirbyteRecord,
        ctx: StreamContext
      ): Promise<ReadonlyArray<DestinationRecord>> {
        const data = record.record.data;
        return [
          {
            model: 'test_Model',
            record: {
              uid: String(data.id),
              source: this.source,
            },
          },
        ];
      }
    }
    const converter = new CustomConverter();
    sut.addConverter(converter);
    const res = sut.getConverter(converter.streamName);

    expect(res).toBeDefined();
    expect(res.destinationModels).toStrictEqual(['test_Model']);
    expect(
      await res.convert(AirbyteRecord.make('s1', {id: 'test'}), null)
    ).toStrictEqual([
      {model: 'test_Model', record: {source: 'Custom', uid: 'test'}},
    ]);
  });

  test('add a custom typed converter class and load it', async () => {
    interface FooBar {
      foo: string;
      bar: number;
    }
    class CustomConverter extends ConverterTyped<FooBar> {
      source = 'Custom';
      destinationModels = ['test_Model'];
      id(record: AirbyteRecord): string {
        return record.record.data.id;
      }
      async convert(
        record: AirbyteRecord,
        ctx: StreamContext
      ): Promise<ReadonlyArray<DestinationRecordTyped<FooBar>>> {
        const data = record.record.data;
        return [
          {
            model: 'test_Model',
            record: {
              foo: String(data.id),
              bar: 123,
            },
          },
        ];
      }
    }
    const converter = new CustomConverter();
    sut.addConverter(converter);
    const res = sut.getConverter(converter.streamName);

    expect(res).toBeDefined();
    expect(res.destinationModels).toStrictEqual(['test_Model']);
    expect(
      await res.convert(AirbyteRecord.make('s1', {id: 'test'}), null)
    ).toStrictEqual([{model: 'test_Model', record: {bar: 123, foo: 'test'}}]);
  });
});
