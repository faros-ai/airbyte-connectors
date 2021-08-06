import readline from 'readline';

import {Connector} from './connector';
import {
  AirbyteConfig,
  AirbyteState,
  ConfiguredAirbyteCatalog,
} from './protocol';

/**
 * Airbyte Destination
 * https://docs.airbyte.io/understanding-airbyte/airbyte-specification#destination
 */
export abstract class AirbyteDestination extends Connector {
  /**
   * Implement to define how the connector writes data to the destination
   */
  abstract write(
    config: AirbyteConfig,
    catalog: ConfiguredAirbyteCatalog,
    input: readline.Interface
  ): AsyncGenerator<AirbyteState>;
}
