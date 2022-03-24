import {camelCase, upperFirst} from 'lodash';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {Converter, StreamName} from './converter';

/**
 * A handy converter registry to get registered converters by stream name
 */
export class ConverterRegistry {
  private static convertersByStream: Dictionary<Converter | boolean> = {};

  /**
   * Get converter by stream name.
   *
   * Dynamically loads and creates converter by stream.
   *
   * Example: for stream { source: 'github', name: 'pull_request_stats' }
   * we dynamically import module './github/pull_request_stats'
   * and create a class GithubPullRequestStats.
   *
   * @param streamName stream name
   * @param onLoadError handler to call on converter loading error
   * @returns converter if any
   */
  static getConverter(
    streamName: StreamName,
    onLoadError?: (err: Error) => void
  ): Converter | undefined {
    const name = streamName.asString;

    const res = ConverterRegistry.convertersByStream[name];
    if (res && typeof res !== 'boolean') return res;
    if (res) return undefined;

    try {
      // Load the necessary module dynamically
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(`./${streamName.source}/${streamName.name}`);

      // Create converter instance by name
      const converterClass = mod[upperFirst(camelCase(streamName.name))];
      if (!converterClass) {
        throw new VError(
          `Could not find converter from module for stream ${name}`
        );
      }
      const converter = new converterClass();

      // Keep the converter instance in the registry
      ConverterRegistry.convertersByStream[name] = converter;
      return converter;
    } catch (e: any) {
      // Tried loading the converter but failed - no need to retry
      ConverterRegistry.convertersByStream[name] = true;
      if (onLoadError) {
        const err = e.message ?? String(e);
        onLoadError(
          new VError(`Failed loading converter for stream ${name}: ${err}`)
        );
      }
      return undefined;
    }
  }

  /**
   * Add a convertor to the registry.
   */
  static addConverter(converter: Converter): void {
    const name = converter.streamName.asString;
    ConverterRegistry.convertersByStream[name] = converter;
  }
}
