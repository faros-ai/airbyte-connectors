import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {readResourceFile} from 'faros-airbyte-common/common';
import fs from 'fs-extra';
import path from 'path';
import {VError} from 'verror';

import * as sut from '../src/index';
import {SheetsConfig, SheetsReader} from '../src/sheets-reader';

const sheets = SheetsReader.instance;

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.INFO
  );

  beforeEach(() => {
    SheetsReader.instance = sheets;
  });



  test('spec', async () => {
    const source = new sut.SheetsSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    const source = new sut.SheetsSource(logger);

    async function testConnectionWithExpectedError(
      inputObject: any,
      expectedErrorMessage: string
    ): Promise<void> {
      await expect(source.checkConnection(inputObject)).resolves.toStrictEqual([
        false,
        new VError(expectedErrorMessage),
      ]);
    }

    // Test for LocalSpreadsheet case
    testConnectionWithExpectedError(
      {
        spreadsheet_source: {
          sheet_source: 'LocalSpreadsheet',
        },
      },
      'Please specify file path'
    );

    // Test for GoogleSheet case with missing google_sheet_id
    testConnectionWithExpectedError(
      {
        spreadsheet_source: {
          sheet_source: 'GoogleSheet',
        },
      },
      'Please specify Google sheet ID'
    );

    // Test for GoogleSheet case with both private key and API key
    testConnectionWithExpectedError(
      {
        spreadsheet_source: {
          sheet_source: 'GoogleSheet',
          google_sheet_id: 'your-sheet-id',
          google_service_account_private_key: 'your-private-key',
          google_api_key: 'your-api-key',
        },
      },
      'Please specify exactly one of Google account private key or Google API key'
    );

    // Test for GoogleSheet case with neither private key nor API key
    testConnectionWithExpectedError(
      {
        spreadsheet_source: {
          sheet_source: 'GoogleSheet',
          google_sheet_id: 'your-sheet-id',
        },
      },
      'Please specify exactly one of Google account private key or Google API key'
    );

    // Test for default case
    testConnectionWithExpectedError(
      {},
      'Please configure a spreadsheet source'
    );

    // Test for S3Spreadsheet case with missing file
    testConnectionWithExpectedError(
      {
        spreadsheet_source: {
          sheet_source: 'S3Spreadsheet',
          aws_region: 'your-aws-region',
          aws_access_key_id: 'your-access-key-id',
          aws_secret_access_key: 'your-secret-access-key',
        },
      },
      'Please specify file path'
    );

    // Test for S3Spreadsheet case with file missing 's3://' prefix
    testConnectionWithExpectedError(
      {
        spreadsheet_source: {
          sheet_source: 'S3Spreadsheet',
          file: 'your-bucket/your-path',
          aws_region: 'your-aws-region',
          aws_access_key_id: 'your-access-key-id',
          aws_secret_access_key: 'your-secret-access-key',
        },
      },
      'Please specify file path in s3://bucket/path format'
    );

    // Test for S3Spreadsheet case with missing AWS region
    testConnectionWithExpectedError(
      {
        spreadsheet_source: {
          sheet_source: 'S3Spreadsheet',
          file: 's3://your-bucket/your-path',
          aws_access_key_id: 'your-access-key-id',
          aws_secret_access_key: 'your-secret-access-key',
        },
      },
      'Please specify AWS region'
    );

    // Test for S3Spreadsheet case with missing AWS access key ID
    testConnectionWithExpectedError(
      {
        spreadsheet_source: {
          sheet_source: 'S3Spreadsheet',
          file: 's3://your-bucket/your-path',
          aws_region: 'your-aws-region',
          aws_secret_access_key: 'your-secret-access-key',
        },
      },
      'Please specify AWS access key ID'
    );

    // Test for S3Spreadsheet case with missing AWS secret access key
    testConnectionWithExpectedError(
      {
        spreadsheet_source: {
          sheet_source: 'S3Spreadsheet',
          file: 's3://your-bucket/your-path',
          aws_region: 'your-aws-region',
          aws_access_key_id: 'your-access-key-id',
        },
      },
      'Please specify AWS secret access key'
    );
  });

  test('reads local spreadsheet', async () => {
    const source = new sut.SheetsSource(logger);
    const streams = source.streams({
      spreadsheet_source: {
        sheet_source: 'LocalSpreadsheet',
        file: path.join(__dirname, 'test_files/test_spreadsheet.xlsx'),
      },
    } as SheetsConfig);

    const sheetsStream = streams[0];
    const sheetsIter = sheetsStream.readRecords(SyncMode.FULL_REFRESH);
    const output = [];
    for await (const rec of sheetsIter) {
      output.push(rec);
    }

    expect(output).toMatchSnapshot();
  });
});
