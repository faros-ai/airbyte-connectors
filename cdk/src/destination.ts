import readline from 'readline';

import {
  AirbyteCatalog,
  AirbyteConfig,
  AirbyteConnectionStatus,
  AirbyteMessage,
  AirbyteSpec,
} from './protocol';

export abstract class AirbyteDestination {
  abstract spec(): Promise<AirbyteSpec>;

  abstract check(config: AirbyteConfig): Promise<AirbyteConnectionStatus>;

  abstract discover(): Promise<AirbyteCatalog>;

  abstract write(
    config: AirbyteConfig,
    catalog: AirbyteCatalog,
    input: readline.Interface
  ): AsyncGenerator<AirbyteMessage>;
}
