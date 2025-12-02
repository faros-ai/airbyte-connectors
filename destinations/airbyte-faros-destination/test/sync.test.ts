import {AirbyteLogger} from 'faros-airbyte-cdk';
import {getLocal} from 'mockttp';

import FarosSyncClient from '../src/sync';

describe('FarosSyncClient', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let farosSyncClient: FarosSyncClient;

  beforeEach(async () => {
    await mockttp.start({startPort: 30000, endPort: 50000});
    farosSyncClient = new FarosSyncClient(
      {apiKey: 'test', url: mockttp.url},
      new AirbyteLogger()
    );
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  const accountId = 'test-account';
  const missingAccountId = 'missing-account';
  const graph = 'default';

  describe('createLocalAccount', () => {
    it('should create an account', async () => {
      await mockttp
        .forPost('/accounts')
        .once()
        .thenReply(200, JSON.stringify({account: {accountId}}));

      const account = await farosSyncClient.createLocalAccount(
        accountId,
        graph,
        {}
      );
      expect(account.accountId).toBe(accountId);
    });
  });

  describe('updateLocalAccount', () => {
    it('should merge config and use provided type (mode undefined)', async () => {
      const existingParams = {existingKey: 'value1', sharedKey: 'oldValue'};
      const newConfig = {newKey: 'value2', sharedKey: 'newValue'};
      const mergedParams = {
        existingKey: 'value1',
        sharedKey: 'newValue',
        newKey: 'value2',
        graphName: graph,
      };

      // Mock GET to return existing account
      await mockttp
        .forGet(`/accounts/${accountId}`)
        .once()
        .thenReply(
          200,
          JSON.stringify({
            account: {
              accountId,
              params: existingParams,
              type: 'existing-type',
              mode: 'existing-mode',
              local: true,
            },
          })
        );

      // Mock PUT - mode undefined when not provided
      await mockttp
        .forPut(`/accounts/${accountId}`)
        .once()
        .withJsonBody({
          accountId,
          params: mergedParams,
          type: 'custom',
          local: true,
        })
        .thenReply(
          200,
          JSON.stringify({
            account: {
              accountId,
              params: mergedParams,
              type: 'custom',
              local: true,
            },
          })
        );

      const account = await farosSyncClient.updateLocalAccount(
        accountId,
        graph,
        newConfig,
        'custom'
      );
      expect(account.params).toEqual(mergedParams);
      expect(account.type).toBe('custom');
      expect(account.mode).toBeUndefined();
    });

    it('should use provided type and mode when both specified', async () => {
      const existingParams = {key: 'value'};

      await mockttp
        .forGet(`/accounts/${accountId}`)
        .once()
        .thenReply(
          200,
          JSON.stringify({
            account: {
              accountId,
              params: existingParams,
              type: 'old-type',
              mode: 'old-mode',
              local: true,
            },
          })
        );

      await mockttp
        .forPut(`/accounts/${accountId}`)
        .once()
        .withJsonBodyIncluding({
          type: 'new-type',
          mode: 'new-mode',
        })
        .thenReply(
          200,
          JSON.stringify({
            account: {
              accountId,
              params: {...existingParams, graphName: graph},
              type: 'new-type',
              mode: 'new-mode',
              local: true,
            },
          })
        );

      const account = await farosSyncClient.updateLocalAccount(
        accountId,
        graph,
        {},
        'new-type',
        'new-mode'
      );
      expect(account.type).toBe('new-type');
      expect(account.mode).toBe('new-mode');
    });

    it('should not fail if account is not found', async () => {
      await mockttp
        .forGet(`/accounts/${missingAccountId}`)
        .once()
        .thenReply(
          404,
          JSON.stringify({error: `Account ${missingAccountId} does not exist`})
        );

      const account = await farosSyncClient.updateLocalAccount(
        missingAccountId,
        graph,
        {},
        'custom'
      );
      expect(account).toBeUndefined();
    });
  });

  describe('getAccount', () => {
    it('should get an account', async () => {
      await mockttp
        .forGet(`/accounts/${accountId}`)
        .once()
        .thenReply(200, JSON.stringify({account: {accountId}}));

      const account = await farosSyncClient.getAccount(accountId);
      expect(account.accountId).toBe(accountId);
    });

    it('should not fail if account is not found', async () => {
      await mockttp
        .forGet(`/accounts/${missingAccountId}`)
        .once()
        .thenReply(
          404,
          JSON.stringify({error: `Account ${missingAccountId} does not exist`})
        );

      const account = await farosSyncClient.getAccount(missingAccountId);
      expect(account).toBeUndefined();
    });
  });

  describe('getOrCreateAccount', () => {
    it('should create account if it does not exist', async () => {
      const config = {key1: 'value1'};
      const expectedParams = {...config, graphName: graph};

      // Mock GET - account not found
      await mockttp
        .forGet(`/accounts/${accountId}`)
        .once()
        .thenReply(
          404,
          JSON.stringify({error: `Account ${accountId} does not exist`})
        );

      // Mock POST - create account
      await mockttp
        .forPost('/accounts')
        .once()
        .withJsonBodyIncluding({
          accountId,
          params: expectedParams,
          local: true,
        })
        .thenReply(
          200,
          JSON.stringify({
            account: {
              accountId,
              params: expectedParams,
              type: 'custom',
              local: true,
            },
          })
        );

      const account = await farosSyncClient.getOrCreateAccount(
        accountId,
        graph,
        config
      );
      expect(account.accountId).toBe(accountId);
      expect(account.params).toEqual(expectedParams);
    });

    it('should merge config and preserve type/mode for existing local account', async () => {
      const existingParams = {existingKey: 'value1', sharedKey: 'oldValue'};
      const newConfig = {newKey: 'value2', sharedKey: 'newValue'};
      const mergedParams = {
        existingKey: 'value1',
        sharedKey: 'newValue',
        newKey: 'value2',
        graphName: graph,
      };

      await mockttp
        .forGet(`/accounts/${accountId}`)
        .twice()
        .thenReply(
          200,
          JSON.stringify({
            account: {
              accountId,
              params: existingParams,
              type: 'custom',
              mode: 'test-mode',
              local: true,
            },
          })
        );

      await mockttp
        .forPut(`/accounts/${accountId}`)
        .once()
        .withJsonBodyIncluding({
          params: mergedParams,
          type: 'custom',
          mode: 'test-mode',
        })
        .thenReply(
          200,
          JSON.stringify({
            account: {
              accountId,
              params: mergedParams,
              type: 'custom',
              mode: 'test-mode',
              local: true,
            },
          })
        );

      const account = await farosSyncClient.getOrCreateAccount(
        accountId,
        graph,
        newConfig
      );
      expect(account.params).toEqual(mergedParams);
      expect(account.type).toBe('custom');
      expect(account.mode).toBe('test-mode');
    });

    it('should not update non-local account', async () => {
      const existingParams = {key: 'value'};
      const newConfig = {newKey: 'newValue'};

      // Mock GET - account exists but is NOT local
      await mockttp
        .forGet(`/accounts/${accountId}`)
        .once()
        .thenReply(
          200,
          JSON.stringify({
            account: {
              accountId,
              params: existingParams,
              type: 'custom',
              local: false, // NOT local
            },
          })
        );

      // No PUT should be called for non-local accounts

      const account = await farosSyncClient.getOrCreateAccount(
        accountId,
        graph,
        newConfig
      );
      expect(account.accountId).toBe(accountId);
      expect(account.params).toEqual(existingParams); // Unchanged
      expect(account.local).toBe(false);
    });
  });

  describe('createAccountSync', () => {
    it('should create an account sync', async () => {
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
      await mockttp
        .forPut(`/accounts/${missingAccountId}/syncs`)
        .once()
        .thenReply(
          404,
          JSON.stringify({error: `Account ${missingAccountId} does not exist`})
        );

      const accountSync = await farosSyncClient.createAccountSync(
        missingAccountId,
        new Date()
      );
      expect(accountSync).toBeUndefined();
    });

    it('should not fail if server error returned', async () => {
      await mockttp
        .forPut(`/accounts/${accountId}/syncs`)
        .always()
        .thenReply(500);

      const accountSync = await farosSyncClient.createAccountSync(
        accountId,
        new Date()
      );
      expect(accountSync).toBeUndefined();
    });
  });

  describe('updateAccountSync', () => {
    it('should update an account sync', async () => {
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
        {
          status,
          endedAt,
          metrics,
          warnings: warnings.map((w) => {
            return {type: 'WARNING', ...w};
          }),
          errors: errors.map((e) => {
            return {type: 'ERROR', ...e};
          }),
        }
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
    const syncId = '1';
    await mockttp
      .forPatch(`/accounts/${missingAccountId}/syncs/${syncId}`)
      .once()
      .thenReply(
        404,
        JSON.stringify({error: `Account ${missingAccountId} does not exist`})
      );

    const accountSync = await farosSyncClient.updateAccountSync(
      missingAccountId,
      syncId,
      {status: 'success'}
    );
    expect(accountSync).toBeUndefined();
  });

  it('should not fail if sync is not found', async () => {
    const missingSyncId = 'missing-sync';
    await mockttp
      .forPatch(`/accounts/${missingAccountId}/syncs/${missingSyncId}`)
      .once()
      .thenReply(
        404,
        JSON.stringify({error: 'Sync missing-sync does not exist'})
      );

    const accountSync = await farosSyncClient.updateAccountSync(
      missingAccountId,
      missingSyncId,
      {status: 'success'}
    );
    expect(accountSync).toBeUndefined();
  });

  it('should not fail if server error returned', async () => {
    const syncId = '1';
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
