import fs from 'fs';
import path from 'path';

import {traverseObject} from '../src';

const RESOURCES_DIR = path.join(__dirname, 'resources', 'help');

function loadJSON(fileName: string): Promise<any> {
  return JSON.parse(
    fs.readFileSync(path.join(RESOURCES_DIR, fileName), 'utf8')
  );
}

describe('traverse', () => {
  test('simple', () => {
    expect(traverseObject(loadJSON('simple-spec.json'), [])).toMatchSnapshot();
  });

  test('order', () => {
    expect(traverseObject(loadJSON('order.json'), [])).toMatchSnapshot();
  });

  test('description', () => {
    expect(
      traverseObject(
        {
          title: 'Spec',
          type: 'object',
          properties: {
            user: {
              type: 'string',
              description: 'the description',
            },
          },
        },
        []
      )
    ).toMatchSnapshot();
  });

  test('constValue', () => {
    expect(
      traverseObject(
        {
          title: 'Spec',
          type: 'object',
          properties: {
            user: {
              type: 'string',
              const: 'the const',
            },
          },
        },
        []
      )
    ).toMatchSnapshot();
  });

  test('default', () => {
    expect(
      traverseObject(
        {
          title: 'Spec',
          type: 'object',
          properties: {
            user: {
              type: 'string',
              default: 'the default',
            },
          },
        },
        []
      )
    ).toMatchSnapshot();
  });

  test('examples', () => {
    expect(
      traverseObject(
        {
          title: 'Spec',
          type: 'object',
          properties: {
            user: {
              type: 'string',
              examples: ['Alice', 'Bob', 'Charlie'],
            },
          },
        },
        []
      )
    ).toMatchSnapshot();
  });

  test('airbyte_secret', () => {
    expect(
      traverseObject(
        {
          title: 'Spec',
          type: 'object',
          properties: {
            user: {
              type: 'string',
              airbyte_secret: true,
            },
          },
        },
        []
      )
    ).toMatchSnapshot();
  });

  test('multiline', () => {
    expect(
      traverseObject(
        {
          title: 'Spec',
          type: 'object',
          properties: {
            user: {
              type: 'string',
              multiline: true,
            },
          },
        },
        []
      )
    ).toMatchSnapshot();
  });

  test('oneOf', () => {
    expect(traverseObject(loadJSON('one-of.json'), [])).toMatchSnapshot();
  });

  test('enum', () => {
    expect(
      traverseObject(
        {
          title: 'Spec',
          type: 'object',
          properties: {
            graphql_api: {
              type: 'string',
              enum: ['v1', 'v2'],
            },
          },
        },
        []
      )
    ).toMatchSnapshot();
  });

  test('deprecated', () => {
    expect(
      traverseObject(
        {
          title: 'Spec',
          type: 'object',
          properties: {
            user: {
              type: 'string',
            },
            name: {
              type: 'string',
              deprecated: true,
            },
            age: {
              type: 'integer',
              deprecated: false,
            },
          },
        },
        []
      )
    ).toMatchSnapshot();
  });

  test('oneOf deprecated', () => {
    expect(
      traverseObject(loadJSON('one-of-deprecated.json'), [])
    ).toMatchSnapshot();
  });

  test('airbyte_hidden', () => {
    expect(
      traverseObject(
        {
          title: 'Spec',
          type: 'object',
          properties: {
            user: {
              type: 'string',
            },
            name: {
              type: 'string',
              airbyte_hidden: true,
            },
            age: {
              type: 'integer',
              airbyte_hidden: false,
            },
            address: {
              title: 'Address',
              type: 'object',
              airbyte_hidden: true,
              properties: {
                street: {
                  type: 'string',
                },
              },
            },
          },
        },
        []
      )
    ).toMatchSnapshot();
  });

  test('oneOf airbyte_hidden', () => {
    expect(
      traverseObject(loadJSON('one-of-airbyte-hidden.json'), [])
    ).toMatchSnapshot();
  });

  test('array of objects', () => {
    expect(
      traverseObject(loadJSON('array-of-objects.json'), [])
    ).toMatchSnapshot();
  });
});
