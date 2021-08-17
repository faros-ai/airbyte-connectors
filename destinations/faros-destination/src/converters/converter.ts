import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

/** Record converter base class */
export interface Converter {
  /** Function converts an input record to record(s) in destination canonical model schema */
  convert(record: Dictionary<any>): ReadonlyArray<Dictionary<any>>;
}

type Constructor<T> = {
  new (...args: any[]): T;
  readonly prototype: T;
};

type ConverterFactory = {
  converter: Constructor<Converter>;
  destinationModel: string;
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
  private static convertersByStream: Dictionary<ConverterFactory> = {};

  /** Get a record converter by stream name or error if not registered */
  static getConverter(streamName: string): ConverterFactory {
    const converter = ConverterRegistry.convertersByStream[streamName];
    if (!converter) {
      throw new VError(`No converter registered for stream ${streamName}`);
    }
    return converter;
  }

  /** Register a record converter by stream name */
  static registerConverter(
    streamName: string,
    converter: ConverterFactory
  ): void {
    ConverterRegistry.convertersByStream[streamName] = converter;
  }
}
