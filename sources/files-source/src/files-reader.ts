import {
  _Object,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import {AirbyteConfig, AirbyteLogger} from 'faros-airbyte-cdk';
import {VError} from 'verror';

export enum FileProcessingStrategy {
  PROCESS_ALL_FILES = 'PROCESS_ALL_FILES',
  IMMUTABLE_LEXICOGRAPHICAL_ORDER = 'IMMUTABLE_LEXICOGRAPHICAL_ORDER',
}

const DEFAULT_MAX_REQUEST_LENGTH = 1048576; // 1MB
const DEFAULT_BYTES_LIMIT = 1073741824; // 1GB

type S3 = {
  source_type: 'S3';
  path: string;
  aws_region: string;
  aws_access_key_id: string;
  aws_secret_access_key: string;
  aws_session_token?: string;
  file_processing_strategy?: FileProcessingStrategy;
  files?: string[];
  max_request_length?: number;
  bytes_limit?: number;
};

export interface OutputRecord {
  filesSource: string;
  fileName: string;
  chunkNumber: number;
  lastModified: number;
  contents: string;
}

type FilesSource = S3;

export interface FilesConfig extends AirbyteConfig {
  readonly files_source: FilesSource;
  readonly stream_name?: string;
}

export abstract class FilesReader {
  private static filesReader: FilesReader = null;

  protected constructor(readonly config: FilesConfig) {}

  static async instance(
    config: FilesConfig,
    logger?: AirbyteLogger
  ): Promise<FilesReader> {
    if (FilesReader.filesReader) return FilesReader.filesReader;

    switch (config.files_source?.source_type) {
      case 'S3': {
        FilesReader.filesReader = await S3Reader.instance(config, logger);
        return FilesReader.filesReader;
      }
      default:
        throw new VError('Please configure a files source');
    }
  }

  abstract readFiles(
    logger?: AirbyteLogger,
    lastFileName?: string
  ): AsyncGenerator<OutputRecord>;

  abstract checkConnection(): Promise<void>;
}

export class S3Reader {
  constructor(
    readonly config: FilesConfig,
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
    private readonly prefix: string,
    private readonly maxRequestLength: number,
    private readonly bytesLimit: number
  ) {}

  static async instance(
    config: FilesConfig,
    logger?: AirbyteLogger
  ): Promise<FilesReader> {
    if (
      !config.files_source.path ||
      !config.files_source.path.startsWith('s3://')
    ) {
      throw new VError(
        'Please specify S3 bucket path in s3://bucket/path format'
      );
    }
    if (!config.files_source.aws_region) {
      throw new VError('Please specify AWS region');
    }
    if (!config.files_source.aws_access_key_id) {
      throw new VError('Please specify AWS access key ID');
    }
    if (!config.files_source.aws_secret_access_key) {
      throw new VError('Please specify AWS secret access key');
    }
    if (
      config.files_source?.file_processing_strategy &&
      !Object.values(FileProcessingStrategy).includes(
        config.files_source?.file_processing_strategy
      )
    ) {
      throw new VError(
        `Please specify a valid file processing strategy. Valid values are: ${Object.values(
          FileProcessingStrategy
        ).join(', ')}`
      );
    }
    const s3Client = S3Reader.getS3Client(config);
    const {bucketName, prefix} = S3Reader.parseS3Path(config);
    return new S3Reader(
      config,
      s3Client,
      bucketName,
      prefix,
      config.files_source.max_request_length || DEFAULT_MAX_REQUEST_LENGTH,
      config.files_source.bytes_limit || DEFAULT_BYTES_LIMIT
    );
  }

  async checkConnection(): Promise<void> {
    await this.s3Client.send(
      new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: this.prefix,
      })
    );
  }

  async *readFiles(
    logger?: AirbyteLogger,
    lastFileName?: string
  ): AsyncGenerator<OutputRecord> {
    let isTruncated = true;
    let continuationToken: string;
    const objects: _Object[] = [];
    while (isTruncated) {
      const {
        Contents: Objects,
        IsTruncated,
        NextContinuationToken,
      } = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: this.prefix,
          ...(continuationToken && {ContinuationToken: continuationToken}),
          ...(lastFileName && {StartAfter: lastFileName}),
        })
      );
      objects.push(...Objects);
      isTruncated = IsTruncated;
      continuationToken = NextContinuationToken;
    }

    const sortedObjects =
      objects?.sort((a, b) => {
        if (!this.config.files_source.files?.length) return 0;
        const aIndex = this.config.files_source.files.indexOf(
          a.Key.split('/').pop()
        );
        const bIndex = this.config.files_source.files.indexOf(
          b.Key.split('/').pop()
        );
        return aIndex - bIndex;
      }) || [];

    const maxRequestLength = this.maxRequestLength;
    for (const object of sortedObjects) {
      if (object.Key.slice(-1) === '/') continue;

      const fileName = object.Key.split('/').pop();
      if (
        this.config.files_source.files?.length &&
        !this.config.files_source.files.includes(fileName)
      ) {
        logger?.info(
          `Skipping File: ${object.Key} - Size: ${object.Size} - Last Modified: ${object.LastModified}`
        );
        continue;
      }
      logger?.info(
        `Reading File: ${object.Key} - Size: ${object.Size} - Last Modified: ${object.LastModified}`
      );
      let currentByte = 0;
      let chunkNumber = 0;
      while (currentByte < object.Size) {
        if (this.bytesLimit && currentByte >= this.bytesLimit) {
          if (currentByte != object.Size) {
            logger?.warn(
              `File ${object.Key} surpassed the configured bytes limit of ${this.bytesLimit}. Skipping remaining bytes.`
            );
          }
          break;
        }
        const range =
          maxRequestLength > 0
            ? `bytes=${currentByte}-${Math.min(currentByte + maxRequestLength, object.Size) - 1}`
            : undefined;
        const res = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: this.bucketName,
            Key: object.Key,
            IfMatch: object.ETag, // make sure file has not been modified since the beginning of the sync
            ...(range && {Range: range}),
          })
        );
        logger?.debug(
          `Range: ${range} - Content Length: ${res.ContentLength} - Content Range: ${res.ContentRange}`
        );
        if (
          res.ContentLength !== maxRequestLength &&
          res.ContentLength + currentByte !== object.Size
        ) {
          throw new Error(
            'Content Length does not match with the expected value'
          );
        }
        currentByte += res.ContentLength;
        const contents = await res.Body.transformToString('base64');
        yield {
          filesSource: 'S3',
          fileName: object.Key,
          chunkNumber: ++chunkNumber,
          lastModified: object.LastModified.getTime(),
          contents,
        };
      }
    }
  }

  private static getS3Client(config: FilesConfig): S3Client {
    return new S3Client({
      region: config.files_source.aws_region,
      credentials: {
        accessKeyId: config.files_source.aws_access_key_id,
        secretAccessKey: config.files_source.aws_secret_access_key,
        sessionToken: config.files_source.aws_session_token,
      },
    });
  }

  private static parseS3Path(config: FilesConfig): {
    bucketName: string;
    prefix: string;
  } {
    const [bucketName, ...pathParts] = config.files_source.path
      .replace('s3://', '')
      .split('/');
    return {bucketName, prefix: pathParts.join('/')};
  }
}
