import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Converter, StreamContext} from '../../src';
import {
  DestinationModel,
  DestinationRecordTyped,
  splitWithLimit,
  StreamName,
} from '../../src/converters/converter';

describe('converter', () => {
  class GroupUsers extends Converter {
    source = 'MyCustomSource';
    id(record: AirbyteRecord): any {
      return record.record.data.id;
    }
    get destinationModels(): ReadonlyArray<DestinationModel> {
      return [];
    }
    async convert(): Promise<
      ReadonlyArray<DestinationRecordTyped<Dictionary<any>>>
    > {
      return [];
    }
  }

  test('process stream names', () => {
    const converter = new GroupUsers();
    expect(converter.streamName.source).toEqual('MyCustomSource');
    expect(converter.streamName.name).toEqual('group_users');
    expect(converter.streamName.asString).toEqual(
      'mycustomsource__group_users'
    );
  });

  test('set and get records from StreamContext', () => {
    const stream = new GroupUsers().streamName.asString;
    const ctx = new StreamContext(
      new AirbyteLogger(),
      {edition_configs: {}},
      {}
    );
    const record = new AirbyteRecord({
      stream,
      emitted_at: 123,
      data: {id: 'id1'},
    });
    ctx.set(stream, 'id1', record);
    expect(ctx.get(stream, 'id1')).toEqual(record);
    expect(ctx.get(stream, 'id2')).toBeUndefined();
    expect(ctx.getAll(stream)).toEqual({id1: record});
  });

  test('split strings with limit', () => {
    expect(splitWithLimit('a', '-', 1)).toEqual(['a']);
    expect(splitWithLimit('a-b', '-', 1)).toEqual(['a-b']);
    expect(splitWithLimit('a-b', '-', 2)).toEqual(['a', 'b']);
    expect(splitWithLimit('a-b-c-d-e', '-', 3)).toEqual(['a', 'b', 'c-d-e']);
  });

  test('parse stream names from records', () => {
    expect(() => StreamName.fromString('stream')).toThrow(
      /missing source prefix/
    );
    expect(StreamName.fromString('source__stream')).toEqual(
      new StreamName('source', 'stream')
    );
    expect(StreamName.fromString('origin__source__stream')).toEqual(
      new StreamName('source', 'stream')
    );
    expect(StreamName.fromString('source__stream__c')).toEqual(
      new StreamName('source', 'stream__c')
    );
    expect(StreamName.fromString('origin__source__stream__c')).toEqual(
      new StreamName('source', 'stream__c')
    );
    expect(StreamName.fromString('origin__source__Stream__c')).toEqual(
      new StreamName('source', 'Stream__c')
    );
    expect(StreamName.fromString('origin__source__stream__stream__c')).toEqual(
      new StreamName('source', 'stream__stream__c')
    );
  });
});
