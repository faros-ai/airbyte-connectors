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
  static getConverter(streamName: StreamName): Converter | undefined {
    if (!ConverterRegistry.initialized) {
      for (const converter of converters) {
        const name = converter.streamName.stringify();
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
    return ConverterRegistry.convertersByStream[streamName.stringify()];
  }
}
