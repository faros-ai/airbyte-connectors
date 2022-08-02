import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Converter, StreamContext} from '../../src';
import {DestinationRecordTyped} from '../../src/converters/converter';

describe('converter', () => {
  class GroupUsers extends Converter {
    source = 'MyCustomSource';
    id(record: AirbyteRecord) {
      return record.record.data.id;
    }
    get destinationModels(): readonly string[] {
      return [];
    }
    async convert(
      record: AirbyteRecord,
      ctx: StreamContext
    ): Promise<readonly DestinationRecordTyped<Dictionary<any, string>>[]> {
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
    const ctx = new StreamContext(new AirbyteLogger(), {});
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
});
