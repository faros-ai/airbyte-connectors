import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import {AirbyteConfig, AirbyteLogger} from 'faros-airbyte-cdk';
import {VError} from 'verror';

type S3 = {
  type: 'S3';
  path: string;
  aws_region: string;
  aws_access_key_id: string;
  aws_secret_access_key: string;
  aws_session_token?: string;
};

type FilesSource = S3;

export interface FilesConfig extends AirbyteConfig {
  readonly files_source: FilesSource;
  readonly stream_name?: string;
}

export class FilesReader {
  private static filesReader: FilesReader = null;

  constructor(private readonly config: FilesConfig) {}

  static async instance(
    config: FilesConfig,
    logger?: AirbyteLogger
  ): Promise<FilesReader> {
    if (FilesReader.filesReader) return FilesReader.filesReader;

    switch (config.files_source?.type) {
      case 'S3': {
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
        return new FilesReader(config);
      }
      default:
        throw new VError('Please configure a files source');
    }
  }

  async *readFiles(
    logger?: AirbyteLogger
  ): AsyncGenerator<{fileName: string; content: any}> {
    const s3client = new S3Client({
      region: this.config.files_source.aws_region,
      credentials: {
        accessKeyId: this.config.files_source.aws_access_key_id,
        secretAccessKey: this.config.files_source.aws_secret_access_key,
        sessionToken: this.config.files_source.aws_session_token,
      },
    });
    const [bucketName, ...pathParts] = this.config.files_source.path
      .replace('s3://', '')
      .split('/');
    const res = await s3client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: pathParts.join('/'),
      })
    );
    logger.info(JSON.stringify(res.Contents));

    for (const object of res.Contents) {
      if (object.Key.slice(-1) === '/') continue;
      logger?.info(`Reading file: ${object.Key}`);

      const res = await s3client.send(
        new GetObjectCommand({Bucket: bucketName, Key: object.Key})
      );
      const asString = await res.Body.transformToString();
      logger?.info(asString);
      let content = null;
      try {
        content = JSON.parse(asString);
      } catch (e) {
        logger?.error(`File ${object.Key} is not a JSON file`);
      }
      yield {fileName: object.Key, content};
    }
  }
}
