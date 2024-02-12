import {AirbyteLogger,AirbyteLogLevel} from 'faros-airbyte-cdk';
import {getLocal} from 'mockttp';

import FarosSyncClient from '../src/sync';

describe('FarosSyncClient', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let farosSyncClient: FarosSyncClient;

  beforeEach(async () => {
    await mockttp.start({startPort: 30000, endPort: 50000});
    farosSyncClient = new FarosSyncClient({apiKey: 'test', url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  describe('createAccountSync', () => {
    it('should create an account sync', async () => {
      const accountId = 'test-account';
      const startedAt = new Date();
      await mockttp
        .forPut(`/accounts/${accountId}/syncs`)
        .once()
        .withJsonBody({startedAt: startedAt.toISOString()})
        .thenReply(
          200,
          JSON.stringify({
            sync: {
              syncId: '1',
              logId: '1',
              status: 'running',
              startedAt: startedAt.toISOString(),
            },
          })
        );

      const accountSync = await farosSyncClient.createAccountSync(
        accountId,
        startedAt
      );

      expect(accountSync.syncId).toBe('1');
      expect(accountSync.logId).toBe(accountSync.syncId);
      expect(accountSync.startedAt).toStrictEqual(startedAt);
      expect(accountSync.status).toBe('running');
    });

    it('should not fail if account is not found', async () => {
      const accountId = 'missing-account';
      const startedAt = new Date();
      await mockttp
        .forPut(`/accounts/${accountId}/syncs`)
        .once()
        .withJsonBody({startedAt: startedAt.toISOString()})
        .thenReply(
          404,
          JSON.stringify({error: 'Account missing-account does not exist'})
        );

      const accountSync = await farosSyncClient.createAccountSync(
        accountId,
        startedAt
      );
      expect(accountSync).toBeUndefined();
    });

    it('should not fail if server error returned', async () => {
      const accountId = 'missing-account';
      const startedAt = new Date();
      await mockttp
        .forPut(`/accounts/${accountId}/syncs`)
        .always()
        .withJsonBody({startedAt: startedAt.toISOString()})
        .thenReply(500);

      const accountSync = await farosSyncClient.createAccountSync(
        accountId,
        startedAt
      );
      expect(accountSync).toBeUndefined();
    });
  });

  describe('updateAccountSync', () => {
    it('should update an account sync', async () => {
      const accountId = 'test-account';
      const syncId = '1';
      const status = 'success';
      const endedAt = new Date();
      const metrics = {duration: 500, records: {model1: 1, model2: 2}};
      const warnings = [{summary: 'Warning', code: 1, action: 'test'}];
      const errors = [{summary: 'Error', code: 0, action: 'test'}];

      await mockttp
        .forPatch(`/accounts/${accountId}/syncs/${syncId}`)
        .once()
        .withJsonBody({
          endedAt: endedAt.toISOString(),
          status,
          metrics,
          warnings,
          errors,
        })
        .thenReply(
          200,
          JSON.stringify({
            sync: {
              syncId,
              logId: syncId,
              status,
              startedAt: new Date().toISOString(),
              endedAt: endedAt.toISOString(),
              metrics,
              warnings,
              errors,
            },
          })
        );

      const accountSync = await farosSyncClient.updateAccountSync(
        accountId,
        syncId,
        {status, endedAt, metrics, warnings, errors}
      );

      // Assertions
      // Add your assertions here
      expect(accountSync.syncId).toBe(syncId);
      expect(accountSync.logId).toBe(syncId);
      expect(accountSync.startedAt).toBeDefined();
      expect(accountSync.status).toBe('success');
      expect(accountSync.endedAt).toStrictEqual(endedAt);
      expect(accountSync.metrics).toStrictEqual(metrics);
      expect(accountSync.warnings).toStrictEqual(warnings);
      expect(accountSync.errors).toStrictEqual(errors);
    });
  });

  it('should not fail if account is not found', async () => {
    const accountId = 'missing-account';
    const syncId = '1';
    await mockttp
      .forPatch(`/accounts/${accountId}/syncs/${syncId}`)
      .once()
      .thenReply(
        404,
        JSON.stringify({error: 'Account missing-account does not exist'})
      );

    const accountSync = await farosSyncClient.updateAccountSync(
      accountId,
      syncId,
      {status: 'success'}
    );
    expect(accountSync).toBeUndefined();
  });

  it('should not fail if sync is not found', async () => {
    const accountId = 'missing-account';
    const syncId = 'missing-sync';
    await mockttp
      .forPatch(`/accounts/${accountId}/syncs/${syncId}`)
      .once()
      .thenReply(
        404,
        JSON.stringify({error: 'Sync missing-sync does not exist'})
      );

    const accountSync = await farosSyncClient.updateAccountSync(
      accountId,
      syncId,
      {status: 'success'}
    );
    expect(accountSync).toBeUndefined();
  });

  it('should not fail if server error returned', async () => {
    const accountId = 'missing-account';
    const syncId = 'missing-sync';
    await mockttp
      .forPatch(`/accounts/${accountId}/syncs/${syncId}`)
      .always()
      .thenReply(500);

    const accountSync = await farosSyncClient.updateAccountSync(
      accountId,
      syncId,
      {status: 'success'}
    );
    expect(accountSync).toBeUndefined();
  });
});
