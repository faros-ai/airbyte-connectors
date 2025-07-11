import {
  AirbyteConfig,
  AirbyteLogger,
  AirbyteRecord,
  DestinationSyncMode,
} from 'faros-airbyte-cdk';
import {
  FarosClient,
  OriginProvider,
  StreamNameSeparator,
} from 'faros-js-client';
import {difference, snakeCase} from 'lodash';
import sizeof from 'object-sizeof';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {DestinationConfig} from '../common/types';

/** Airbyte -> Faros record converter */
export abstract class ConverterTyped<R> {
  private stream: StreamName;

  /** Name of the source system that records were fetched from (e.g. GitHub) **/
  abstract readonly source: string;

  /** Input stream supported by converter */
  get streamName(): StreamName {
    if (this.stream) return this.stream;
    this.stream = StreamName.fromString(
      `${this.source}${StreamNameSeparator}${snakeCase(this.constructor.name)}`
    );
    return this.stream;
  }

  /** Dependencies on other streams (if any).
   * !!! USE WITH CAUTION !!! Will result in increased memory usage
   * due to accumulation of records in StreamContext (ctx) */
  get dependencies(): ReadonlyArray<StreamName> {
    return [];
  }

  /** Function to extract record id */
  abstract id(record: AirbyteRecord): any;

  /** Returns a minimal version of the record suitable for context storage
   * Override this to provide a reduced representation when this stream is a dependency
   * By default returns the full record */
  toContextStorageRecord(
    record: AirbyteRecord,
    ctx: StreamContext
  ): AirbyteRecord {
    return record;
  }

  /** All the record models produced by converter */
  abstract get destinationModels(): ReadonlyArray<DestinationModel>;

  /** Function to convert an input Airbyte record to Faros Destination canonical record(s) */
  abstract convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecordTyped<R>>>;

  /** On processing complete handler called by the Faros Destination
   * after the input processing is complete.
   * Use this to release any resources or produce any additional records if necessary. */
  async onProcessingComplete(
    ctx: StreamContext // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<ReadonlyArray<DestinationRecordTyped<R>>> {
    return [];
  }
}
export abstract class Converter extends ConverterTyped<Dictionary<any>> {}

// Helper function for reading object type configurations that
// may be inputted as proper JSON via API or stringified JSON via Airbyte UI
export function parseObjectConfig<T>(obj: any, name: string): T | undefined {
  if (!obj) return undefined;
  if (typeof obj === 'object') return obj;
  if (typeof obj === 'string') {
    try {
      return JSON.parse(obj);
    } catch (e) {
      throw new VError(
        `Could not parse JSON object from ${name} ${obj}. Error: ${e}`
      );
    }
  }
  throw new VError(`${name} must be a JSON object or stringified JSON object`);
}

/** Stream context to store records by stream and other helpers */
export class StreamContext implements OriginProvider {
  // Track models to reset by stream. Only models for successful streams should
  // be reset.
  private readonly resetModelsByStream: Dictionary<Set<string>> = {};

  // Maintain an reversed map as well. If multiple streams write the same model,
  // the model should be reset only if all those streams are successful.
  private readonly streamsByResetModel: Dictionary<Set<string>> = {};

  private readonly resetModels: Set<string> = new Set();
  private readonly skipResetModels: Set<string> = new Set();
  private sourceConfig: AirbyteConfig = {};
  private originWithBucketSuffix?: string;

  constructor(
    readonly logger: AirbyteLogger,
    readonly config: DestinationConfig,
    readonly streamsSyncMode: Dictionary<DestinationSyncMode>,
    readonly graph?: string,
    private readonly origin?: string,
    readonly farosClient?: FarosClient
  ) {}

  getOrigin(): string {
    if (this.originWithBucketSuffix) return this.originWithBucketSuffix;
    if (
      this.sourceConfig?.round_robin_bucket_execution &&
      this.sourceConfig?.bucket_id
    ) {
      this.originWithBucketSuffix = [
        this.origin,
        'bucket',
        this.sourceConfig.bucket_id,
      ].join(StreamNameSeparator);
      return this.originWithBucketSuffix;
    }
    return this.origin;
  }

  getSourceConfig(): AirbyteConfig {
    return this.sourceConfig;
  }

  setSourceConfig(redactedConfig: AirbyteConfig) {
    this.sourceConfig = redactedConfig;
  }

  private readonly recordsByStreamName: Dictionary<Dictionary<AirbyteRecord>> =
    Object.create(null);

  getAll(streamName: string): Dictionary<AirbyteRecord> {
    const recs = this.recordsByStreamName[streamName];
    if (recs) {
      return recs;
    }
    return {};
  }
  get(streamName: string, id: string): AirbyteRecord | undefined {
    const recs = this.recordsByStreamName[streamName];
    if (recs) {
      const rec = recs[id];
      if (rec) return rec;
    }
    return undefined;
  }
  set(streamName: string, id: string, record: AirbyteRecord): void {
    const recs = this.recordsByStreamName[streamName];
    if (!recs) this.recordsByStreamName[streamName] = Object.create(null);
    this.recordsByStreamName[streamName][id] = record;
  }
  stats(includeIds = false): string {
    const sizeInBytes = sizeof(this.recordsByStreamName);
    const res = {sizeInBytes};
    for (const s of Object.keys(this.recordsByStreamName)) {
      const ids = Object.keys(this.recordsByStreamName[s]);
      if (includeIds) {
        res[s] = {
          count: ids.length,
          ids,
        };
      } else res[s] = {count: ids.length};
    }
    return JSON.stringify(res);
  }

  registerStreamResetModels(streamName: string, models: Set<string>): void {
    if (!this.resetModelsByStream[streamName]) {
      this.resetModelsByStream[streamName] = new Set(models);
    } else {
      models.forEach((model) =>
        this.resetModelsByStream[streamName].add(model)
      );
    }

    models.forEach((model) => {
      if (!this.streamsByResetModel[model]) {
        this.streamsByResetModel[model] = new Set([streamName]);
      } else {
        this.streamsByResetModel[model].add(streamName);
      }
    });
  }

  markStreamForReset(streamName: string): void {
    const models = this.resetModelsByStream[streamName];
    models?.forEach((model) => {
      const streams = this.streamsByResetModel[model];
      if (streams) {
        streams.delete(streamName);
        if (streams.size === 0) {
          this.resetModels.add(model);
        }
      }
    });
  }

  disableResetForModel(model: string): void {
    this.skipResetModels.add(model);
  }

  // For Sources that do not send stream-level statuses
  markAllStreamsForReset(): void {
    Object.keys(this.resetModelsByStream).forEach((streamName) => {
      this.markStreamForReset(streamName);
    });
  }

  getModelsForReset(): ReadonlySet<string> {
    return new Set(
      difference([...this.resetModels], [...this.skipResetModels])
    );
  }
}

/**
 * Stream name with source prefix, e.g
 * {
 *   source: 'github',
 *   name:   'commits'
 * }
 */
export class StreamName {
  constructor(
    readonly source: string,
    readonly name: string
  ) {}

  private str: string;

  get asString(): string {
    if (this.str) return this.str;
    this.str = `${this.source.toLowerCase()}${StreamNameSeparator}${this.name}`;
    return this.str;
  }

  static fromString(s: string): StreamName {
    if (!s) {
      throw new VError(`Empty stream name ${s}`);
    }
    let res = s.split(StreamNameSeparator);
    if (res.length < 2) {
      throw new VError(
        `Invalid stream name ${s}: missing source prefix (e.g 'github${StreamNameSeparator}')`
      );
    }
    if (res[res.length - 1].length < 3) {
      res = splitWithLimit(s, StreamNameSeparator, res.length > 3 ? 3 : 2);
    }
    return new StreamName(res[res.length - 2], res[res.length - 1]);
  }
}

// Node.js string.split(sep, limit) truncates the result array to limit length
// We want Java string.split() behavior
// Exported only for tests
export function splitWithLimit(str: string, separator: string, limit: number) {
  const parts = str.split(separator);
  if (parts.length <= limit) return parts;

  const limitedParts = parts.slice(0, limit - 1);
  const remainder = parts.slice(limit - 1).join(separator);
  limitedParts.push(remainder);

  return limitedParts;
}

/**
 * Faros record with the destination canonical model, e.g
 * {
 *   model: 'identity_Identity',
 *   record: {
 *     uid:          '123',
 *     fullName:     'John Doe',
 *     primaryEmail: 'john@example.com'
 *   }
 * }
 */
export type DestinationRecordTyped<R extends Dictionary<any>> = {
  readonly model: DestinationModel;
  readonly record: R;
};
export type DestinationRecord = DestinationRecordTyped<Dictionary<any>>;

/** Faros destination model name, e.g identity_Identity, vcs_Commit */
export type DestinationModel = string;
