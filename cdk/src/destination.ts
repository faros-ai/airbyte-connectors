import readline from 'readline';

import {
  AirbyteCatalog,
  AirbyteConfig,
  AirbyteConnectionStatus,
  AirbyteSpec,
  AirbyteState,
} from './protocol';

export abstract class AirbyteDestination {
  abstract spec(): Promise<AirbyteSpec>;

  abstract check(config: AirbyteConfig): Promise<AirbyteConnectionStatus>;

  abstract discover(): Promise<AirbyteCatalog>;

  abstract write(
    config: AirbyteConfig,
    catalog: AirbyteCatalog,
    input: readline.Interface
  ): Promise<AirbyteState | undefined>;
}
