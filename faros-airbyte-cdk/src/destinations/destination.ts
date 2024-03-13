import {AirbyteConnector} from '../connector';
import {
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteStateMessage,
} from '../protocol';

/**
 * Airbyte Destination
 * https://docs.airbyte.io/understanding-airbyte/airbyte-specification#destination
 */
export abstract class AirbyteDestination<
  Config extends AirbyteConfig
> extends AirbyteConnector {
  /**
   * Implement to define how the connector writes data to the destination
   */
  abstract write(
    config: Config,
    redactedConfig: AirbyteConfig,
    catalog: AirbyteConfiguredCatalog,
    stdin: NodeJS.ReadStream,
    dryRun: boolean
  ): AsyncGenerator<AirbyteStateMessage>;
}
