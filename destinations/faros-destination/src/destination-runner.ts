import {Command} from 'commander';
import {AirbyteDestinationRunner, AirbyteLogger} from 'faros-airbyte-cdk';

import {Converter} from './converters/converter';
import {ConverterRegistry} from './converters/converter-registry';
import {FarosDestination} from './destination';

/** Faros destination runner. */
export class FarosDestinationRunner extends AirbyteDestinationRunner {
  readonly program: Command;
  constructor() {
    const logger = new AirbyteLogger();
    const destination = new FarosDestination(logger);
    const destinationRunner = new AirbyteDestinationRunner(logger, destination);
    super(logger, destination);
    this.program = destinationRunner.mainCommand();
  }

  registerConverters(...converters: ReadonlyArray<Converter>): void {
    converters.forEach(ConverterRegistry.addConverter);
  }
}
