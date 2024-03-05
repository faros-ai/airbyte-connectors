import {
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

type S3 = {
  source_type: 'S3';
  path: string;
  aws_region: string;
  aws_access_key_id: string;
  aws_secret_access_key: string;
  aws_session_token?: string;
  file_processing_strategy?: FileProcessingStrategy;
};

export interface OutputRecord {
  filesSource: string;
  fileName: string;
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
    private readonly prefix: string
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
    return new S3Reader(config, s3Client, bucketName, prefix);
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
    while (isTruncated) {
      const {Contents, IsTruncated, NextContinuationToken} =
        await this.s3Client.send(
          new ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: this.prefix,
            ...(continuationToken && {ContinuationToken: continuationToken}),
            ...(lastFileName && {StartAfter: lastFileName}),
          })
        );

      for (const object of Contents || []) {
        if (object.Key.slice(-1) === '/') continue;
        logger?.info(`Reading file: ${object.Key}`);

        const res = await this.s3Client.send(
          new GetObjectCommand({Bucket: this.bucketName, Key: object.Key})
        );
        const contents = await res.Body.transformToString('base64');
        yield {
          filesSource: 'S3',
          fileName: object.Key,
          lastModified: object.LastModified.getTime(),
          contents,
        };
      }

      isTruncated = IsTruncated;
      continuationToken = NextContinuationToken;
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
