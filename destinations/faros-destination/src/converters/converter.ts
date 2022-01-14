import {AirbyteConfig, AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-feeds-sdk';
import {snakeCase} from 'lodash';
import sizeof from 'object-sizeof';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

/** Airbyte -> Faros record converter */
export abstract class Converter {
  private stream: StreamName;

  /** Input stream supported by converter */
  get streamName(): StreamName {
    if (this.stream) return this.stream;
    this.stream = StreamName.fromString(
      snakeCase(this.constructor.name).replace('_', StreamNameSeparator)
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
  ): Promise<ReadonlyArray<DestinationRecord>>;
}

/** Stream context to store records by stream and other helpers */
export class StreamContext {
  constructor(
    readonly config: AirbyteConfig,
    readonly farosClient: FarosClient
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

const StreamNameSeparator = '__';

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
export type DestinationRecord = {
  readonly model: DestinationModel;
  readonly record: Dictionary<any>;
};

/** Faros destination model name, e.g identity_Identity, vcs_Commit */
export type DestinationModel = string;
