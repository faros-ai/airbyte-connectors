import {Mockttp} from 'mockttp';

export async function initMockttp(mockttp: Mockttp): Promise<void> {
  await mockttp.start({startPort: 30000, endPort: 50000});
  await mockttp
    .forGet('/users/me')
    .thenReply(200, JSON.stringify({tenantId: '1'}));
  await mockttp
    .forGet('/graphs/test-graph/statistics')
    .thenReply(200, JSON.stringify({}));
}
