import {AirbyteLogger, AirbyteLogLevel, AirbyteSpec} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {FilesReader} from '../src/files-reader';
import * as sut from '../src/index';

const files = FilesReader.instance;

describe('index', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.INFO
  );

  beforeEach(() => {
    FilesReader.instance = files;
  });

  function readResourceFile(fileName: string): any {
    return JSON.parse(fs.readFileSync(`resources/${fileName}`, 'utf8'));
  }

  test('spec', async () => {
    const source = new sut.FilesSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    const source = new sut.FilesSource(logger);

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
          type: 'S3',
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
          type: 'S3',
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
          type: 'S3',
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
          type: 'S3',
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
          type: 'S3',
          path: 's3://your-bucket/your-path',
          aws_region: 'your-aws-region',
          aws_access_key_id: 'your-access-key-id',
        },
      },
      'Please specify AWS secret access key'
    );
  });
});
