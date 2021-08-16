import {AirbyteRecord} from 'cdk';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

/** Record converter base class */
export interface Converter {
  /** Function to convert an input record to destination record */
  convert(record: AirbyteRecord): any;
}

type Constructor<T> = {
  new (...args: any[]): T;
  readonly prototype: T;
};

/**
 * Record converter decorator.
 * Add one to register a converter with converter registry.
 *
 * @param streamName input source name
 * @param destinationModel destination canonical model
 */
export function Converts(streamName: string, destinationModel: string) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return function <T extends Constructor<Converter>>(constructor: T) {
    ConverterRegistry.registerConverter(streamName, {
      converter: constructor,
      destinationModel,
    });
  };
}

/** Record converters registry */
export class ConverterRegistry {
  /** All record converters by input stream name registered with Converter decorator */
  private static convertersByStream: Dictionary<{
    converter: Constructor<Converter>;
    destinationModel: string;
  }> = {};

  /** Get a record converter by stream name or error if not registered */
  static getConverter(streamName: string): {
    converter: Constructor<Converter>;
    destinationModel: string;
  } {
    const converter = ConverterRegistry.convertersByStream[streamName];
    if (!converter) {
      throw new VError(`No converter registered for stream ${streamName}`);
    }
    return converter;
  }

  /** Register a record converter by stream name */
  static registerConverter(
    streamName: string,
    converter: {
      converter: Constructor<Converter>;
      destinationModel: string;
    }
  ): void {
    ConverterRegistry.convertersByStream[streamName] = converter;
  }
}
