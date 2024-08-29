import {AirbyteLogger} from 'faros-airbyte-cdk';

import {Bitbucket} from '../src/bitbucket';

export function setupBitbucketInstance(apiMock: any, logger: AirbyteLogger) {
  Bitbucket.instance = jest.fn().mockImplementation(() => {
    return new Bitbucket(
      {
        ...apiMock,
        hasNextPage: jest.fn(),
      },
      100,
      false,
      logger
    );
  });
}
