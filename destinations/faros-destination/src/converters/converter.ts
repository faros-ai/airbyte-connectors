import {AirbyteRecord} from 'cdk';
import {Dictionary} from 'ts-essentials';

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
 *   prefix: 'github',
 *   name:   'commits'
 * }
 */
export type StreamName = {
  readonly prefix: string;
  readonly name: string;
};

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
