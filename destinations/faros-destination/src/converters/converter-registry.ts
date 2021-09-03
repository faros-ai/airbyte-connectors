import {camelCase, upperFirst} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Converter, StreamName} from './converter';

/**
 * A handy converter registry to get registered converters by stream name
 */
export class ConverterRegistry {
  private static convertersByStream: Dictionary<Converter> = {};

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
   * @returns converter if any
   */
  static async getConverter(
    streamName: StreamName
  ): Promise<Converter | undefined> {
    const name = streamName.stringify();

    const res = ConverterRegistry.convertersByStream[name];
    if (res) return res;

    try {
      // Load the necessary module dynamically
      const mod = await import(`./${streamName.source}/${streamName.name}`);

      // Create converter instance by name
      const className = upperFirst(camelCase(name));
      const converter = new mod[className]();

      // Keep the converter instance in the registry
      ConverterRegistry.convertersByStream[name] = converter;

      return converter;
    } catch (e) {
      return undefined;
    }
  }
}
