import {
  AirbyteCatalog,
  AirbyteConfig,
  AirbyteConnectionStatus,
  AirbyteMessage,
  AirbyteSpec,
  AirbyteState,
  ConfiguredAirbyteCatalog,
} from './protocol';

export abstract class AirbyteSource {
  abstract spec(): Promise<AirbyteSpec>;

  abstract check(config: AirbyteConfig): Promise<AirbyteConnectionStatus>;

  abstract discover(): Promise<AirbyteCatalog>;

  abstract read(
    config: AirbyteConfig,
    catalog: ConfiguredAirbyteCatalog,
    state?: AirbyteState
  ): AsyncGenerator<AirbyteMessage>;
}
