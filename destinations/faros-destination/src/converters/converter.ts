import {AirbyteRecord} from 'faros-airbyte-cdk';
import {snakeCase} from 'lodash';
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
  // Use with caution!!! Will result in increased memory usage
  // due to accumulation of dependant records in StreamContext (ctx)
  get dependencies(): ReadonlyArray<StreamName> {
    return [];
  }

  /** All the record models produced by converter */
  abstract get destinationModels(): ReadonlyArray<DestinationModel>;

  /** Function converts an input Airbyte record to Faros destination canonical record */
  abstract convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord>;
}

/** Stream context to store records by stream */
export class StreamContext {
  private readonly recordsByStreamName: Dictionary<Dictionary<AirbyteRecord>> =
    {};

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
  stats(): string {
    const res = {};
    for (const s of Object.keys(this.recordsByStreamName)) {
      const ids = Object.keys(this.recordsByStreamName[s]);
      res[s] = {
        count: ids.length,
        ids,
      };
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

  stringify(): string {
    return `${this.source}${StreamNameSeparator}${this.name}`;
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
