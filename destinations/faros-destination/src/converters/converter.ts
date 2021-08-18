import {AirbyteRecord} from 'cdk';
import {Dictionary} from 'ts-essentials';

/** Record converter base class */
export interface Converter {
  /** Function converts an input Airbyte record to destination canonical record */
  convert(record: AirbyteRecord): ReadonlyArray<DestinationRecord>;
}

/**
 * Canonical record with the destination model, e.g
 * {
 *   model: 'identity_Identity',
 *   record: {
 *     uid:          '123',
 *     fullName:     'John Doe',
 *     primaryEmail: 'john@example.com'
 *   }
 * }
 */
export type DestinationRecord = {
  model: DestinationModel;
  record: Dictionary<any>;
};

/** Destination model name, e.g identity_Identity or vcs_Commit */
export type DestinationModel = string;

/** Contructor type shortcut  */
export type Constructor<T> = {
  new (...args: any[]): T;
  readonly prototype: T;
};

/** Record converter factory to instantiate converter instances */
export type ConverterFactory = {
  converter: Constructor<Converter>;
  destinationModels: ReadonlyArray<DestinationModel>;
};

/** Record converter instance */
export type ConverterInstance = {
  converter: Converter;
  destinationModels: ReadonlyArray<DestinationModel>;
};

/**
 * Record converter decorator.
 * Add one to register a converter with converter registry.
 *
 * @param streamName input stream name
 * @param destinationModels destination canonical models
 */
export function Converts(
  streamName: string,
  destinationModels: ReadonlyArray<string>
) {
  // eslint-disable-next-line @typescript-eslint/ban-types
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return function <T extends Constructor<Converter>>(constructor: T) {
    ConverterRegistry.registerConverter(streamName, {
      converter: constructor,
      destinationModels,
    });
  };
}

/** Record converters registry */
export class ConverterRegistry {
  /** All record converters by input stream name registered with Converter decorator */
  private static convertersByStream: Dictionary<ConverterFactory> = {};

  /** Get a record converter factory by stream name */
  static getConverter(streamName: string): ConverterFactory | undefined {
    return ConverterRegistry.convertersByStream[streamName];
  }

  /** Get a record converter instance by stream name */
  static getConverterInstance(
    streamName: string
  ): ConverterInstance | undefined {
    const conv = ConverterRegistry.getConverter(streamName);
    if (conv)
      return {
        converter: new conv.converter(),
        destinationModels: conv.destinationModels,
      };
    return undefined;
  }

  /** Register a record converter by stream name */
  static registerConverter(
    streamName: string,
    converter: ConverterFactory
  ): void {
    ConverterRegistry.convertersByStream[streamName] = converter;
  }
}
