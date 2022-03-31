import {AirbyteConfig, AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-feeds-sdk';
import {snakeCase} from 'lodash';
import sizeof from 'object-sizeof';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

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

  // Dependencies on other streams (if any).
  // !!! Use with caution !!! Will result in increased memory usage
  // due to accumulation of records in StreamContext (ctx)
  get dependencies(): ReadonlyArray<StreamName> {
    return [];
  }

  /** Function to extract record id */
  abstract id(record: AirbyteRecord): any;

  /** All the record models produced by converter */
  abstract get destinationModels(): ReadonlyArray<DestinationModel>;

  /** Function converts an input Airbyte record to Faros destination canonical record */
  abstract convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecordTyped<R>>>;
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
export class StreamContext {
  constructor(
    readonly logger: AirbyteLogger,
    readonly config: AirbyteConfig,
    readonly farosClient?: FarosClient
  ) {}

  private readonly recordsByStreamName: Dictionary<Dictionary<AirbyteRecord>> =
    {};

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
    if (!recs) this.recordsByStreamName[streamName] = {};
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
}

export const StreamNameSeparator = '__';

/**
 * Stream name with source prefix, e.g
 * {
 *   source: 'github',
 *   name:   'commits'
 * }
 */
export class StreamName {
  constructor(readonly source: string, readonly name: string) {}

  private str: string;

  get asString(): string {
    if (this.str) return this.str;
    this.str = `${this.source}${StreamNameSeparator}${this.name}`;
    return this.str;
  }

  static fromString(s: string): StreamName {
    if (!s) {
      throw new VError(`Empty stream name ${s}`);
    }
    const res = s.split(StreamNameSeparator);
    if (res.length < 2) {
      throw new VError(
        `Invalid stream name ${s}: missing source prefix (e.g 'github${StreamNameSeparator}')`
      );
    }
    return new StreamName(res[res.length - 2], res[res.length - 1]);
  }
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
