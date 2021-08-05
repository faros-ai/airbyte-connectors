import {
  AirbyteCatalog,
  AirbyteConfig,
  AirbyteConnectionStatus,
  AirbyteSourceState,
  AirbyteSpec,
} from './protocol';

export abstract class AirbyteSource {
  abstract spec(): Promise<AirbyteSpec>;

  abstract check(config: AirbyteConfig): Promise<AirbyteConnectionStatus>;

  abstract discover(): Promise<AirbyteCatalog>;

  abstract read(
    config: AirbyteConfig,
    catalog: AirbyteCatalog,
    state?: AirbyteSourceState
  ): Promise<AirbyteSourceState | undefined>;
}
