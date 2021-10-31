import {Bitbucket} from 'bitbucket';

describe('index', () => {
  test('ok?', async () => {
    expect('OK').toEqual('OK');
  });

  test('getWorkspace', async () => {
    const config = require('../secrets/config.json');
    const auth = config.token
      ? {token: config.token}
      : {username: config.username, password: config.password};

    const client = new Bitbucket({baseUrl: config.serverUrl, auth});
    const res = await client.repositories.get({
      workspace: config.workspace,
      repo_slug: 'feeds',
    });

    expect(res).not.toBeNull();
  });
});
