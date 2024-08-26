import {AirbyteLogger, readTestResourceAsJSON} from 'faros-airbyte-cdk';

import {Bitbucket} from '../src/bitbucket';

export function setupBitbucketInstance(apiMock: any, logger: AirbyteLogger) {
  Bitbucket.instance = jest.fn().mockImplementation(() => {
    return new Bitbucket(
      {
        ...apiMock,
        hasNextPage: jest.fn(),
      },
      100,
      logger,
      new Date('2010-03-27T14:03:51-0800')
    );
  });
}
