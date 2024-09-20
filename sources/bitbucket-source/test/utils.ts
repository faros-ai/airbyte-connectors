import {AirbyteLogger, readTestResourceAsJSON} from 'faros-airbyte-cdk';

import {Bitbucket} from '../src/bitbucket';
import {BitbucketConfig} from '../src/types';

export function setupBitbucketInstance(
  apiMock: any,
  logger: AirbyteLogger,
  config: BitbucketConfig = readTestResourceAsJSON('config.json')
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
        config.bucket_id,
        config.bucket_total,
        5,
        logger
      );
    }
    return bitbucketInstance;
  });
}
