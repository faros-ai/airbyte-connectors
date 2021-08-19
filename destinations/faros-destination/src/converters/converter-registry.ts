import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {converters} from '.';
import {Converter, StreamName} from './converter';

/**
 * A handy converter registry to get registered converters by stream name
 */
export class ConverterRegistry {
  private static initialized = false;
  private static convertersByStream: Dictionary<Converter> = {};

  /**
   * Get registered converter by stream name
   *
   * @param streamName stream name
   * @returns converter if any
   */
  static getConverter(streamName: string): Converter | undefined {
    if (!ConverterRegistry.initialized) {
      for (const converter of converters) {
        const name = ConverterRegistry.streamNameToString(converter.streamName);
        const existing = ConverterRegistry.convertersByStream[name];
        if (existing) {
          throw new VError(
            `Duplicate converters registered for stream ${name}: ` +
              `${existing.constructor.name} and ${converter.constructor.name}`
          );
        }
        ConverterRegistry.convertersByStream[name] = converter;
      }
      ConverterRegistry.initialized = true;
    }
    return ConverterRegistry.convertersByStream[streamName];
  }

  private static streamNameToString(name: StreamName): string {
    return `${name.prefix}__${name.name}`;
  }
}
