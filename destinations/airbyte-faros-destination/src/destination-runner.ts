import {Command} from 'commander';
import {
  AirbyteConfig,
  AirbyteDestinationRunner,
  AirbyteLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';

import {DestinationConfig} from './common/types';
import {Converter} from './converters/converter';
import {ConverterRegistry} from './converters/converter-registry';
import {FarosDestination} from './destination';
import {FarosDestinationLogger} from './destination-logger';

/** Faros Destination Runner */
export class FarosDestinationRunner extends AirbyteDestinationRunner<DestinationConfig> {
  readonly program: Command;

  /**
   * Creates a new Faros Destination Runner instance
   *
   * @param specOverride overrides the default specification with a custom one
   */
  constructor(specOverride: AirbyteSpec = undefined) {
    const logger = new FarosDestinationLogger();
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
   * Add an additional configuration check. Handy when using spec override.
   */
  onConfigCheck(check: (config: AirbyteConfig) => Promise<void>): void {
    (this.destination as FarosDestination).onConfigCheck = check;
  }
}
