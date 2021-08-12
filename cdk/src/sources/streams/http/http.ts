import {AirbyteStreamBase} from '../core';

/**
 * Base abstract class for an Airbyte Stream using the HTTP protocol. Basic
 * building block for users building an Airbyte source for a HTTP API.
 */
export abstract class AirbyteHttpStream extends AirbyteStreamBase {
  get sourceDefinedCursor(): boolean {
    return true;
  }
}
