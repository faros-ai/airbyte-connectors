import {
  AirbyteLogger,
  readTestResourceFile,
  readTestResourceAsJSON,
  readResourceFile,
  readResourceAsJSON,
} from 'faros-airbyte-cdk';

import {Bitbucket} from '../src/bitbucket';
import {BitbucketConfig} from '../src/types';

export function setupBitbucketInstance(
  apiMock: any,
  logger: AirbyteLogger,
  requestedStreams: Set<string> = new Set(),
  config?: BitbucketConfig
) {
  let bitbucketInstance: Bitbucket | null = null;
  Bitbucket.instance = jest.fn().mockImplementation(() => {
    if (!bitbucketInstance) {
      bitbucketInstance = new Bitbucket(
        {
          ...apiMock,
          hasNextPage: jest.fn(),
        },
        100,
        config?.bucket_id ?? 1,
        config?.bucket_total ?? 1,
        5,
        logger,
        requestedStreams
      );
    }
    return bitbucketInstance;
  });
}
