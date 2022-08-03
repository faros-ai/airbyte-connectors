import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteConnectionStatusMessage,
  AirbyteDestinationRunner,
  AirbyteLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';

import {Converter} from './converters/converter';
import {ConverterRegistry} from './converters/converter-registry';
import {FarosDestination} from './destination';

/** Faros Destination Runner */
export class FarosDestinationRunner extends AirbyteDestinationRunner {
  readonly program: Command;

  /**
   * Creates a new Faros Destination Runner instance
   *
   * @param specOverride overrides the default specification with a custom one
   */
  constructor(specOverride: AirbyteSpec = undefined) {
    const logger = new AirbyteLogger();
    const destination = new FarosDestination(logger, specOverride);
    super(logger, destination);
    this.program = super.mainCommand();
  }

  /**
   * Register converters for custom streams
   */
  registerConverters(...converters: ReadonlyArray<Converter>): void {
    converters.forEach(ConverterRegistry.addConverter);
  }

  /**
   * Add an additional configuration check
   */
  onConfigCheck(check: (config: AirbyteConfig) => Promise<void>) {
    (this.destination as FarosDestination).onConfigCheck = check;
  }
}
