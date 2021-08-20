import {AirbyteRecord} from 'cdk';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

/** Record converter */
export interface Converter {
  /** Input stream supported by converter */
  get streamName(): StreamName;

  /** All the record models produced by converter */
  get destinationModels(): ReadonlyArray<DestinationModel>;

  /** Function converts an input Airbyte record to destination canonical record */
  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord>;
}

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
    return `${this.source}__${this.name}`;
  }

  static fromString(s: string): StreamName {
    if (!s) {
      throw new VError(`Empty stream name ${s}`);
    }
    const res = s.split('__');
    if (res.length < 2) {
      throw new VError(
        `Invalid stream name ${s}: missing source prefix (e.g 'github__')`
      );
    }
    return new StreamName(res[res.length - 2], res[res.length - 1]);
  }
}

/**
 * Canonical record with the destination model, e.g
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

/** Destination model name, e.g identity_Identity or vcs_Commit */
export type DestinationModel = string;
