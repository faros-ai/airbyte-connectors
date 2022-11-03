import {VError, WError} from 'verror';

import {AirbyteConfig, AirbyteSpec, withDefaults} from '../src';
import {wrapApiError} from '../src/errors';

describe('errors', () => {
  function createAxiosError(message: string, cause?: Error): any {
    const error: any = new VError({cause}, message);
    error.isAxiosError = true;
    error.request = {
      url: '/go',
      method: 'GET',
      headers: {
        Authorization: 'secret',
      },
    };
    error.config = {baseURL: 'http://test.me'};
    error.response = {
      status: 500,
      data: 'Internal Server Error',
      headers: {
        'Content-Type': 'text/html',
      },
    };
    return error;
  }

  test('wraps the cause unchanged', () => {
    const error = new Error('cause');
    const wrappedError: any = wrapApiError(error, 'message');
    expect(wrappedError).toEqual(new WError(error, 'message'));
  });

  test('wrapped error can be printed', () => {
    const error = createAxiosError('message1');
    const wrappedError: any = wrapApiError(error, 'message');
    expect(`${wrappedError}`).toEqual(
      'VError: message: API responded with status 500: Internal Server Error'
    );
    expect(JSON.stringify(wrappedError)).toMatchSnapshot();
  });

  test('includes info field for axios error', () => {
    const error = createAxiosError('message1');
    const wrappedError: any = wrapApiError(error, 'message');
    expect(wrappedError.message).toMatch(
      /message: API responded with status 500: Internal Server Error/
    );
    expect(wrappedError.request).toBeUndefined();
    expect(wrappedError.response).toBeUndefined();
    expect(wrappedError.config).toBeUndefined();
    expect(VError.info(wrappedError)).toMatchSnapshot();
  });

  test('includes info field for nested axios error', () => {
    const cause = createAxiosError('cause');
    const error = new VError(cause, 'error');
    const wrappedError: any = wrapApiError(error, 'message');
    expect(wrappedError.message).toBe('message');
    const wrappedCause: any = VError.cause(wrappedError);
    expect(wrappedCause).not.toBeUndefined();
    expect(wrappedCause.message).toBe('error: cause');
    expect(VError.cause(wrappedCause)?.message).toBe(
      'API responded with status 500: Internal Server Error'
    );
    expect(wrappedCause.request).toBeUndefined();
    expect(wrappedCause.response).toBeUndefined();
    expect(wrappedCause.config).toBeUndefined();
    expect(VError.info(wrappedCause)).toMatchSnapshot();
  });
});

describe('utils', () => {
  const testSpec = {
    documentationUrl: 'https://docs.faros.ai',
    supportsIncremental: true,
    supportsNormalization: false,
    supportsDBT: true,
    connectionSpecification: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Faros Destination Spec',
      type: 'object',
      required: ['edition_configs'],
      additionalProperties: true,
      properties: {
        edition_configs: {
          order: 0,
          title: 'Faros Edition',
          description: 'Choose your Faros Edition.',
          type: 'object',
          oneOf: [
            {
              type: 'object',
              title: 'Community Edition',
              required: ['hasura_url'],
              properties: {
                edition: {
                  type: 'string',
                  title: 'Community Edition',
                  description: 'Community Edition',
                  const: 'community',
                },
                hasura_admin_secret: {
                  type: 'string',
                  title: 'Hasura Admin Secret',
                  description: 'The Hasura Admin Secret.',
                  airbyte_secret: true,
                },
                hasura_url: {
                  type: 'string',
                  title: 'Hasura URL',
                  description: 'The Community Edition Hasura URL.',
                  default: 'http://localhost:8080',
                },
                segment_user_id: {
                  type: 'string',
                  title: 'Segment User Id',
                  description:
                    'The User UUID with which to track events in Segment. If not present, then reporting is disabled. See https://community.faros.ai/docs/telemetry for more details.',
                  format: 'uuid',
                },
                community_graphql_batch_size: {
                  type: 'integer',
                  title: 'GraphQL mutation batch size',
                  description:
                    'Maximum number of mutations to execute in a single request to GraphQL backend',
                  default: 100,
                },
              },
            },
            {
              type: 'object',
              title: 'Cloud Edition',
              required: ['api_key', 'api_url'],
              properties: {
                edition: {
                  type: 'string',
                  title: 'Cloud Edition',
                  description: 'Cloud Edition',
                  const: 'cloud',
                },
                api_url: {
                  type: 'string',
                  title: 'API URL',
                  description: 'The Faros API URL.',
                  default: 'https://prod.api.faros.ai',
                  examples: ['https://prod.api.faros.ai'],
                },
                api_key: {
                  title: 'API Key',
                  type: 'string',
                  description: 'The Faros API key to use to access the API.',
                  airbyte_secret: true,
                },
                graph: {
                  type: 'string',
                  title: 'Graph name',
                  description: 'The Faros graph name.',
                  default: 'default',
                },
                use_graphql_v2: {
                  type: 'boolean',
                  title: 'GraphQL Version 2',
                  description: 'Use version 2 of graphql engine.',
                  default: false,
                },
                cloud_graphql_batch_size: {
                  type: 'integer',
                  title: 'GraphQL mutation batch size',
                  description:
                    'Maximum number of mutations to execute in a single request to GraphQL backend.',
                  default: 100,
                },
                check_tenant: {
                  type: 'boolean',
                  title: 'Check tenant',
                  description: 'Check tenant on init.',
                  default: true,
                },
                expiration: {
                  type: 'string',
                  title: 'Revision expiration',
                  description: 'The Faros graph revision expiration time.',
                  default: '5 seconds',
                  examples: ['5 seconds'],
                },
              },
            },
          ],
        },
        origin: {
          order: 1,
          type: 'string',
          title: 'Origin name',
          description:
            'The Faros origin name used for uploaded entries. Must be unique.',
          examples: ['my-faros-destination'],
        },
        dry_run: {
          order: 2,
          type: 'boolean',
          title: 'Dry run',
          description:
            'Process all input records but avoid writing into Faros API',
          default: false,
        },
        invalid_record_strategy: {
          order: 3,
          type: 'string',
          title: 'Invalid record strategy',
          description: 'Strategy to follow to handle an invalid input record.',
          default: 'SKIP',
          enum: ['FAIL', 'SKIP'],
        },
        jsonata_expression: {
          order: 4,
          type: 'string',
          title: 'JSONata expression',
          description:
            'JSONata expression for converting input records. If provided applies the expression based on specified JSONata apply mode.',
        },
        jsonata_mode: {
          order: 5,
          type: 'string',
          title: 'JSONata apply mode',
          description: 'JSONata apply mode when converting input records.',
          default: 'FALLBACK',
          enum: ['FALLBACK', 'OVERRIDE'],
        },
        jsonata_destination_models: {
          order: 6,
          type: 'array',
          items: {
            type: 'string',
          },
          title: 'JSONata destination models',
          description: 'Destination models when using JSONata expression.',
          examples: ['ims_Incident', 'vcs_Commit'],
        },
      },
    },
  };
  const spec = new AirbyteSpec(testSpec);

  interface DestinationConfig extends AirbyteConfig {
    readonly dry_run?: boolean;
    readonly jsonata_mode?: string;
    readonly edition_configs: {
      readonly edition: string;
      readonly api_url: string;
      readonly api_key: string;
      readonly graph: string;
      readonly check_tenant?: boolean;
      readonly origin?: string;
      readonly cloud_graphql_batch_size?: number;
    };
    readonly invalid_record_strategy: string;
    readonly origin?: string;
  }

  const config: DestinationConfig = {
    dry_run: false,
    jsonata_mode: 'FALLBACK',
    edition_configs: {
      edition: 'cloud',
      api_url: 'http://localhost:8081',
      api_key: 'Bearer k1',
      graph: 'ted',
      check_tenant: false,
    },
    invalid_record_strategy: 'SKIP',
  };

  test('withDefaults prop with default and defined value', () => {
    const res = withDefaults(config, spec);
    expect(res.edition_configs.check_tenant).toBeDefined();
    expect(config.edition_configs.check_tenant).toStrictEqual(
      res.edition_configs.check_tenant
    );
  });

  test('withDefaults prop without default and defined value', () => {
    const res = withDefaults(config, spec);
    expect(res.edition_configs.api_key).toBeDefined();
    expect(config.edition_configs.api_key).toStrictEqual(
      res.edition_configs.api_key
    );
  });

  test('withDefaults prop without default and undefined value', () => {
    const res = withDefaults(config, spec);
    expect(res.origin).toBeUndefined();
    expect(config.edition_configs.origin).toBeUndefined();
  });

  test('withDefaults prop with default and undefined value', () => {
    const res = withDefaults(config, spec);
    expect(res.edition_configs.cloud_graphql_batch_size).toBeDefined();
    expect(config.edition_configs.cloud_graphql_batch_size).toBeUndefined();
  });
});
