import {GetObjectCommand, S3Client, S3ClientConfig} from '@aws-sdk/client-s3';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {
  GoogleSpreadsheet,
  GoogleSpreadsheetRow,
  GoogleSpreadsheetWorksheet,
  ServiceAccountCredentials,
} from 'google-spreadsheet';
import {VError} from 'verror';
import XLSX from 'xlsx';

type GoogleCreds = string | ServiceAccountCredentials;

type LocalSpreadsheet = {
  sheet_source: 'LocalSpreadsheet';
  file: string;
};

type GoogleSheet = {
  sheet_source: 'GoogleSheet';
  google_sheet_id: string;
  google_service_account_private_key?: string;
  google_api_key?: string;
};

type S3Spreadsheet = {
  sheet_source: 'S3Spreadsheet';
  file: string;
  aws_region: string;
  aws_access_key_id: string;
  aws_secret_access_key: string;
  aws_session_token?: string;
};

type SpreadsheetSource = LocalSpreadsheet | GoogleSheet | S3Spreadsheet;

export interface SheetsConfig {
  readonly spreadsheet_source: SpreadsheetSource;
  readonly sheet_names?: string[];
  readonly row_offset?: number;
  readonly sheet_page_size?: number;
  readonly stream_name?: string;
}

export class SheetsReader {
  private static sheetsReader: SheetsReader = null;
  private static sheetId: string = null; // Google Sheets ID for the current workbook

  constructor(private readonly wb: XLSX.WorkBook) {}

  static async instance(
    config: SheetsConfig,
    logger?: AirbyteLogger
  ): Promise<SheetsReader> {
    if (SheetsReader.sheetsReader) return SheetsReader.sheetsReader;

    let wb = null;

    switch (config.spreadsheet_source?.sheet_source) {
      case 'LocalSpreadsheet':
        if (!config.spreadsheet_source.file) {
          throw new VError('Please specify file path');
        }

        wb = await SheetsReader.loadFile(
          config.spreadsheet_source.file,
          logger
        );
        break;
      case 'GoogleSheet': {
        if (!config.spreadsheet_source.google_sheet_id) {
          throw new VError('Please specify Google sheet ID');
        }

        const privateKey =
          config.spreadsheet_source.google_service_account_private_key;
        const apiKey = config.spreadsheet_source.google_api_key;

        if ((privateKey && apiKey) || (!privateKey && !apiKey)) {
          throw new VError(
            'Please specify exactly one of Google account private key or Google API key'
          );
        }

        const creds = privateKey
          ? (JSON.parse(privateKey) as ServiceAccountCredentials)
          : apiKey;

        wb = await SheetsReader.loadSheets(
          config.spreadsheet_source.google_sheet_id,
          config.sheet_names,
          config.sheet_page_size,
          config.row_offset,
          creds,
          logger
        );
        break;
      }
      case 'S3Spreadsheet': {
        if (!config.spreadsheet_source.file) {
          throw new VError('Please specify file path');
        }
        if (!config.spreadsheet_source.file.startsWith('s3://')) {
          throw new VError(
            'Please specify file path in s3://bucket/path format'
          );
        }
        if (!config.spreadsheet_source.aws_region) {
          throw new VError('Please specify AWS region');
        }
        if (!config.spreadsheet_source.aws_access_key_id) {
          throw new VError('Please specify AWS access key ID');
        }
        if (!config.spreadsheet_source.aws_secret_access_key) {
          throw new VError('Please specify AWS secret access key');
        }

        const [bucketName, ...pathParts] = config.spreadsheet_source.file
          .replace('s3://', '')
          .split('/');

        wb = await SheetsReader.loadS3(
          {
            region: config.spreadsheet_source.aws_region,
            credentials: {
              accessKeyId: config.spreadsheet_source.aws_access_key_id,
              secretAccessKey: config.spreadsheet_source.aws_secret_access_key,
              sessionToken: config.spreadsheet_source.aws_session_token,
            },
          },
          bucketName,
          pathParts.join('/'),
          logger
        );

        break;
      }
      default:
        throw new VError('Please configure a spreadsheet source');
    }

    SheetsReader.sheetsReader = new SheetsReader(wb);
    return SheetsReader.sheetsReader;
  }

  async *readRows(logger?: AirbyteLogger): AsyncGenerator<{
    sheetName: string;
    row: any;
    sheetId: string;
    id: string;
  }> {
    for (const sheetName of this.getSheetNames()) {
      logger?.info(`Reading sheet: ${sheetName}`);

      const rows = XLSX.utils.sheet_to_json(this.wb.Sheets[sheetName], {
        defval: null,
      });

      for (let i = 0; i < rows.length; i++) {
        // Generate a unique record ID for each row
        const recordId = `${SheetsReader.sheetId}_${this.normalizeSheetName(
          sheetName
        )}_${i}`;
        const row = rows[i];
        yield {sheetName, row, sheetId: SheetsReader.sheetId, id: recordId};
      }
    }
  }

  getSheetNames(): ReadonlyArray<string> {
    return this.wb.SheetNames;
  }

  normalizeSheetName(sheetName: string): string {
    return sheetName.toLowerCase().split(' ').join('_');
  }

  static async loadFile(
    file: string,
    logger?: AirbyteLogger
  ): Promise<XLSX.WorkBook> {
    logger?.info(`Opening file ${file}`);

    const wb = XLSX.readFile(file, {cellDates: true});

    logger?.info(
      `Opened file '${file}' with ${
        wb.SheetNames.length
      } sheets: ${wb.SheetNames.join(', ')}`
    );

    // get sheetId from file name (without containing folders and extension)
    SheetsReader.sheetId = this.getFileName(file);

    return wb;
  }

  private static getFileName(file: string) {
    return file.split('/').pop().split('.')[0];
  }

  static async loadSheets(
    sheetId: string,
    sheetNames: string[],
    sheetPageSize: number,
    rowOffset: number,
    creds: GoogleCreds,
    logger?: AirbyteLogger
  ): Promise<XLSX.WorkBook> {
    logger?.info(`Opening Google Spreadsheet with ID ${sheetId}`);
    const doc = new GoogleSpreadsheet(sheetId);

    if (typeof creds === 'string') {
      logger?.info('Authenticating with Google using API key');
      doc.useApiKey(creds);
    } else {
      logger?.info(
        `Authenticating with Google using service account ${creds.client_email}`
      );

      logger?.info(
        `Expecting that ${creds.client_email} has Viewer access to Google Spreadsheet with ID ${sheetId}`
      );

      await doc.useServiceAccountAuth(creds);
    }

    await doc.loadInfo();
    logger?.info(
      `Opened Google Spreadsheet '${doc.title}' with ${
        doc.sheetCount
      } sheets: ${Object.keys(doc.sheetsByTitle).join(', ')}`
    );

    // Store sheets id in sheetId for returning it with rows
    SheetsReader.sheetId = sheetId;

    const wb = XLSX.utils.book_new();

    for (const sheetName of Object.keys(doc.sheetsByTitle)) {
      if (sheetNames && !sheetNames.includes(sheetName)) {
        continue;
      }
      const sheet = await SheetsReader.loadSheet(
        doc,
        sheetName,
        sheetPageSize,
        rowOffset,
        logger
      );
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    }

    return wb;
  }

  static async loadS3(
    s3CientConf: S3ClientConfig,
    bucket: string,
    bucketPath: string,
    logger?: AirbyteLogger
  ): Promise<XLSX.WorkBook> {
    logger?.info(`Opening file 's3://${bucket}/${bucketPath}'`);

    const s3client = new S3Client(s3CientConf);
    const res = await s3client.send(
      new GetObjectCommand({Bucket: bucket, Key: bucketPath})
    );
    const bytes = await res.Body.transformToByteArray();
    const wb = XLSX.read(bytes, {cellDates: true});

    logger?.info(
      `Opened file 's3://${bucket}/${bucketPath}' with ${
        wb.SheetNames.length
      } sheets: ${wb.SheetNames.join(', ')}`
    );

    SheetsReader.sheetId = `${bucket}/${bucketPath}`;

    return wb;
  }

  static async loadSheet(
    doc: GoogleSpreadsheet,
    sheetName: string,
    sheetPageSize: number,
    rowOffset: number,
    logger?: AirbyteLogger
  ): Promise<XLSX.WorkSheet> {
    const sheet = SheetsReader.getSheetOrError(doc, sheetName);

    await sheet.loadHeaderRow(1 + (rowOffset ?? 0));
    const header = sheet.headerValues;

    const rows = await SheetsReader.getSheetRows(
      sheet,
      sheetName,
      sheetPageSize,
      logger
    );
    const aoa = [header].concat(rows.map((r) => r._rawData));
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    return ws;
  }

  static getSheetOrError(
    sheet: GoogleSpreadsheet,
    name: string
  ): GoogleSpreadsheetWorksheet {
    const res = sheet.sheetsByTitle[name];
    if (!res) {
      const knownSheets = Object.keys(sheet.sheetsByTitle).join(', ');
      throw new VError(
        `Sheet named '%s' was not found. Known sheets: %s`,
        name,
        knownSheets
      );
    }
    return res;
  }

  static async getSheetRows(
    sheet: GoogleSpreadsheetWorksheet,
    name: string,
    pageSize: number,
    logger?: AirbyteLogger
  ): Promise<GoogleSpreadsheetRow[]> {
    const res: GoogleSpreadsheetRow[] = [];
    let total = 0;
    let fetchedRows = 0;
    const nonHeaderRowCount = sheet.rowCount - 1; // -1 because row count includes header row, but it's excluded from getRows
    // Fetch rows in batches of pageSize until we reach the end of the sheet
    do {
      const rows = await sheet.getRows({limit: pageSize, offset: total});
      res.push(...rows);
      fetchedRows = rows.length;
      total += fetchedRows;
    } while (fetchedRows > 0 && total < nonHeaderRowCount);

    logger?.info(`Fetched ${res.length} rows from '${name}' sheet`);
    return res;
  }
}
