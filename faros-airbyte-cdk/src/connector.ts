import {
  AirbyteConfig,
  AirbyteConnectionStatusMessage,
  AirbyteSpec,
} from './protocol';

export abstract class AirbyteConnector {
  /**
   * @returns the spec for this integration. The spec is a JSON-Schema object
   * describing the required configurations (e.g: username and password)
   * required to run this integration.
   */
  abstract spec(minimize?: boolean): Promise<AirbyteSpec>;

  /**
   * Tests if the input configuration can be used to successfully connect to the
   * integration e.g: if a provided Stripe API token can be used to connect to
   * the Stripe API.
   *
   * @returns Whether the check succeeds or fails with an error message.
   */
  abstract check(
    config: AirbyteConfig
  ): Promise<AirbyteConnectionStatusMessage>;
}
