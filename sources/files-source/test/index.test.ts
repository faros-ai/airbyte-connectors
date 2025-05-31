import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON
} from 'faros-airbyte-testing-tools';
import {VError} from 'verror';

import {FilesConfig, S3Reader} from '../lib/files-reader';
import {FilesReader} from '../src/files-reader';
import * as sut from '../src/index';

const files = FilesReader.instance;

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.INFO
  );

  const validConfig: FilesConfig = {
    files_source: {
      source_type: 'S3',
      path: 's3://your-bucket/your-path',
      aws_region: 'your-aws-region',
      aws_access_key_id: 'your-access-key-id',
      aws_secret_access_key: 'your-secret-access-key',
    },
  };

  beforeEach(() => {
    FilesReader.instance = files;
  });


  const source = new sut.FilesSource(logger);

  test('spec', async () => {
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection - invalid', async () => {
    async function testConnectionWithExpectedError(
      inputObject: any,
      expectedErrorMessage: string
    ): Promise<void> {
      await expect(source.checkConnection(inputObject)).resolves.toStrictEqual([
        false,
        new VError(expectedErrorMessage),
      ]);
    }

    // Test for default case
    testConnectionWithExpectedError({}, 'Please configure a files source');

    // Test for S3 case with missing path
    testConnectionWithExpectedError(
      {
        files_source: {
          source_type: 'S3',
          aws_region: 'your-aws-region',
          aws_access_key_id: 'your-access-key-id',
          aws_secret_access_key: 'your-secret-access-key',
        },
      },
      'Please specify S3 bucket path in s3://bucket/path format'
    );

    // Test for S3 case with path missing 's3://' prefix
    testConnectionWithExpectedError(
      {
        files_source: {
          source_type: 'S3',
          path: 'your-bucket/your-path',
          aws_region: 'your-aws-region',
          aws_access_key_id: 'your-access-key-id',
          aws_secret_access_key: 'your-secret-access-key',
        },
      },
      'Please specify S3 bucket path in s3://bucket/path format'
    );

    // Test for S3 case with missing AWS region
    testConnectionWithExpectedError(
      {
        files_source: {
          source_type: 'S3',
          path: 's3://your-bucket/your-path',
          aws_access_key_id: 'your-access-key-id',
          aws_secret_access_key: 'your-secret-access-key',
        },
      },
      'Please specify AWS region'
    );

    // Test for S3 case with missing AWS access key ID
    testConnectionWithExpectedError(
      {
        files_source: {
          source_type: 'S3',
          path: 's3://your-bucket/your-path',
          aws_region: 'your-aws-region',
          aws_secret_access_key: 'your-secret-access-key',
        },
      },
      'Please specify AWS access key ID'
    );

    // Test for S3 case with missing AWS secret access key
    testConnectionWithExpectedError(
      {
        files_source: {
          source_type: 'S3',
          path: 's3://your-bucket/your-path',
          aws_region: 'your-aws-region',
          aws_access_key_id: 'your-access-key-id',
        },
      },
      'Please specify AWS secret access key'
    );
  });

  test('check connection', async () => {
    FilesReader.instance = jest.fn().mockImplementation(() => {
      return new S3Reader(
        validConfig,
        {
          send: jest.fn(),
        } as any,
        'your-bucket',
        'your-path'
      );
    });
    await expect(source.checkConnection(validConfig)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('files full', async () => {
    const fnSend = jest.fn();
    const listObjects = {
      Contents: [
        {
          Key: 'your-path/',
          LastModified: new Date('2023-12-03T01:18:03.000Z'),
        },
        {
          Key: 'your-path/1.json',
          LastModified: new Date('2023-12-03T01:18:03.000Z'),
          Size: 100,
        },
      ],
      IsTruncated: false,
    };
    const getObject = {
      Body: {
        transformToString: () => {
          return 'test';
        },
      },
    };
    FilesReader.instance = jest.fn().mockImplementation(() => {
      return new S3Reader(
        validConfig,
        {
          send: fnSend
            .mockResolvedValueOnce(listObjects)
            .mockResolvedValueOnce(getObject),
        } as any,
        'your-bucket',
        'your-path'
      );
    });

    const streams = source.streams(validConfig);
    const stream = streams[0];
    const iter = stream.readRecords(SyncMode.FULL_REFRESH);

    const items = [];
    for await (const item of iter) {
      items.push(item);
    }

    expect(fnSend).toHaveBeenCalledTimes(2);
    expect(items).toMatchSnapshot();
  });
});
