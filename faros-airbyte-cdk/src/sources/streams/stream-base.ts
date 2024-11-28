import {Utils} from 'faros-js-client';
import {isNil, snakeCase} from 'lodash';
import moment from 'moment';
import {Dictionary} from 'ts-essentials';
import VError from 'verror';

import {AirbyteLogger} from '../../logger';
import {AirbyteStream, SyncMode} from '../../protocol';

export type StreamKey = string | string[] | string[][];

/**
 * Base abstract class for an Airbyte Stream. Makes no assumption of the
 * Stream's underlying transport protocol.
 */
export abstract class AirbyteStreamBase {
  constructor(protected readonly logger: AirbyteLogger) {}

  /**
   * @returns Stream name. By default this is the implementing class name, but
   * it can be overridden as needed.
   */
  get name(): string {
    return snakeCase(this.constructor.name);
  }

  /**
   * Override to return a list of stream names that this stream depends on. Adding a stream
   * to this list will ensure that the stream is always run
   * (if requested in the configured catalog) before this stream.
   *
   * @returns An array of stream names that this stream depends on.
   */
  get dependencies(): ReadonlyArray<string> {
    return [];
  }

  /**
   * This method should be overridden by subclasses to read records based on the
   * inputs
   */
  abstract readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Dictionary<any>>;

  /**
   * @returns A dict of the JSON schema representing this stream.
   * TODO: get by name from resources/schemas folder
   */
  abstract getJsonSchema(): Dictionary<any>;

  asAirbyteStream(): AirbyteStream {
    const stream: AirbyteStream = {
      name: this.name,
      json_schema: this.getJsonSchema(),
      supported_sync_modes: [SyncMode.FULL_REFRESH],
    };

    if (this.supportsIncremental) {
      stream.source_defined_cursor = this.sourceDefinedCursor;
      stream.supported_sync_modes?.push(SyncMode.INCREMENTAL);
      stream.default_cursor_field = this.wrappedCursorField();
    }

    const keys = AirbyteStreamBase.wrappedPrimaryKey(this.primaryKey);
    if (keys && keys.length > 0) {
      stream.source_defined_primary_key = keys;
    }

    return stream;
  }

  /**
   * @returns True if this stream supports incrementally reading data
   */
  get supportsIncremental(): boolean {
    return this.wrappedCursorField().length > 0;
  }

  private wrappedCursorField(): string[] {
    if (!this.cursorField) {
      throw new VError(
        'Cursor field cannot be null, undefined, or empty string'
      );
    }

    const cursorField =
      typeof this.cursorField === 'string'
        ? [this.cursorField]
        : this.cursorField;

    // Airbyte UI on version >= 0.51.x does not support nested cursor fields,
    // resulting in an error on Connection setup. We work around this issue by
    // only sending the first value in the cursorField array during the
    // "discover" step. This workaround should not affect the functionality of
    // the connectors, as the streams define their own cursor logic and do not
    // rely on the value of wrappedCursorField (our sources do not allow the
    // user to change the default cursor field).
    // https://github.com/airbytehq/airbyte/issues/36253
    if (process.env.WORKER_JOB_ID) {
      return cursorField.length ? [cursorField[0]] : [];
    }
    return cursorField;
  }

  /**
   * Override to return the default cursor field used by this stream e.g: an API
   * entity might always use created_at as the cursor field.
   * @returns The name of the field used as a cursor. If the cursor is nested,
   * return an array consisting of the path to the cursor.
   */
  get cursorField(): string | string[] {
    return [];
  }

  /**
   * @returns False if the cursor can be configured by the user.
   */
  get sourceDefinedCursor(): boolean {
    return true;
  }

  /**
   * @returns string if single primary key, list of strings if composite primary
   * key, list of list of strings if composite primary key consisting of nested
   * fields.  If the stream has no primary keys, return None.
   */
  abstract get primaryKey(): StreamKey | undefined;

  /* eslint-disable @typescript-eslint/no-unused-vars */

  /**
   * Override to define the slices for this stream. See the stream slicing
   * section of the docs for more information.
   */
  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<Dictionary<any> | undefined> {
    yield undefined;
  }

  /**
   * Decides how often to checkpoint state (i.e: emit a STATE message). E.g: if
   * this returns a value of 100, then state is persisted after reading 100
   * records, then 200, 300, etc.. A good default value is 1000 although your
   * mileage may vary depending on the underlying data source.
   *
   * Checkpointing a stream avoids re-reading records in the case a sync is
   * failed or cancelled.
   *
   * @returns None if state should not be checkpointed e.g: because records
   * returned from the underlying data source are not returned in ascending
   * order with respect to the cursor field. This can happen if the source does
   * not support reading records in ascending order of created_at date (or
   * whatever the cursor is).  In those cases, state must only be saved once the
   * full stream has been read.
   */
  get stateCheckpointInterval(): number | undefined {
    return undefined;
  }

  /**
   * Override to extract state from the latest record. Needed to implement
   * incremental sync.
   *
   * Inspects the latest record extracted from the data source and the current
   * state object and return an updated state object.
   *
   * For example: if the state object is based on created_at timestamp, and the
   * current state is {'created_at': 10}, and the latest_record is {'name':
   * 'octavia', 'created_at': 20 } then this method would return {'created_at':
   * 20} to indicate state should be updated to this object.
   *
   * @param currentStreamState The stream's current state object
   * @param latestRecord The latest record extracted from the stream
   * @param streamSlice The current stream slice being processed
   * @returns An updated state object
   */
  getUpdatedState(
    currentStreamState: Dictionary<any>,
    latestRecord: Dictionary<any>,
    streamSlice?: Dictionary<any>
  ): Dictionary<any> {
    return currentStreamState ?? {};
  }

  /**
   * Override to perform any action before reading slices.
   */
  async onBeforeRead(): Promise<void> {}

  /**
   * Override to perform any action after reading all slices.
   */
  async onAfterRead(): Promise<void> {}

  /* eslint-enable @typescript-eslint/no-unused-vars */

  /**
   * @returns wrap the primary_key property in a list of list of strings
   * required by the Airbyte Stream object.
   */
  static wrappedPrimaryKey(keys?: StreamKey): string[][] | undefined {
    if (!keys) {
      return undefined;
    }

    if (typeof keys === 'string') {
      return [[keys]];
    } else {
      const wrappedKeys: string[][] = [];
      for (const component of keys) {
        wrappedKeys.push(
          typeof component === 'string' ? [component] : component
        );
      }
      return wrappedKeys;
    }
  }
}

export interface StreamState {
  [key: string]: {
    cutoff: number;
  };
}

export function calculateUpdatedStreamState(
  latestRecordCutoff: Date,
  currentStreamState: StreamState,
  key: string,
  cutoffLagDays: number = 0
): StreamState {
  if (isNil(latestRecordCutoff)) {
    return currentStreamState;
  }

  const currentCutoff = Utils.toDate(currentStreamState?.[key]?.cutoff ?? 0);

  const adjustedLatestRecordCutoff = moment(latestRecordCutoff)
    .subtract(cutoffLagDays, 'days')
    .toDate();

  if (adjustedLatestRecordCutoff > currentCutoff) {
    const newState = {
      cutoff: adjustedLatestRecordCutoff.getTime(),
    };
    return {
      ...currentStreamState,
      [key]: newState,
    };
  }
  return currentStreamState;
}
