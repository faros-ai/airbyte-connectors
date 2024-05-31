import {AirbyteRecord} from 'faros-airbyte-cdk';

import {JSONataConverter as sut} from '../../src/converters/jsonata';

describe('jsonata', () => {
  test('fails if empty destination models', async () => {
    expect(() => sut.make('', [])).toThrow(
      'Destination models cannot be empty'
    );
  });

  test('fails if bad jsonata expression', async () => {
    expect(() => sut.make('bad jsonata', ['A', 'B'])).toThrow(
      'Failed to parse JSONata expression'
    );
  });

  test('converts records', async () => {
    expect(
      await sut
        .make("(data.({'Person': {'name':name}}))", ['Person'])
        .convert(AirbyteRecord.make('X', {name: 'John Doe'}))
    ).toMatchInlineSnapshot(`
      Array [
        Object {
          "model": "Person",
          "record": Object {
            "name": "John Doe",
          },
        },
      ]
    `);
  });

  test('fails if bad jsonata result', async () => {
    expect(async () => {
      await sut
        .make("(data.({'Person': {'name':name}, 'UnexpectedKey':1}))", [
          'Person',
        ])
        .convert(AirbyteRecord.make('X', {name: 'John Doe'}));
    }).rejects.toThrow('jsonata result should contain a single key');
  });
});
