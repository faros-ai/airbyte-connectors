import * as sut from '../src/nodes';
import {entrySchema} from './helpers';

describe('nodes', () => {
  test('decode node id', () => {
    const nodes = new sut.Nodes(entrySchema);
    expect(
      nodes.decodeId('HmNpY2RfRGVwbG95bWVudB4CCE1vY2sCDjQwLVByb2Q=')
    ).toEqual({
      source: 'Mock',
      uid: '40-Prod',
    });
    expect(
      nodes.decodeId(
        'PGNpY2RfQXJ0aWZhY3RDb21taXRBc3NvY2lhdGlvbnwCAgICCE1vY2sCEGZhcm9zLWFpAg5zb2xhcmlzAgIwAgICDnNvbGFyaXMCAghNb2NrAhBmYXJvcy1haQICMA=='
      )
    ).toEqual({
      artifact: {
        repository: {
          organization: {
            source: 'Mock',
            uid: 'faros-ai',
          },
          uid: 'solaris',
        },
        uid: '0',
      },
      commit: {
        repository: {
          organization: {
            source: 'Mock',
            uid: 'faros-ai',
          },
          name: 'solaris',
        },
        sha: '0',
      },
    });
  });
});
