import fs from 'fs';
import {getLocal} from 'mockttp';

import {tempConfig} from '../temp';
import {CLI, read} from './../cli';
import {githubLog} from './data';

describe('github', () => {
  const mockttp = getLocal();
  const catalogPath = 'test/resources/github-catalog.json';
  let configPath: string;

  beforeEach(async () => {
    await mockttp.start({startPort: 30000, endPort: 50000});
    configPath = await tempConfig(mockttp.url);
  });

  afterEach(async () => {
    await mockttp.stop();
    fs.unlinkSync(configPath);
  });

  test('write', async () => {
    await mockttp
      .post('/graphs/test-graph/models')
      .withQuery({schema: 'canonical'})
      .thenReply(200, JSON.stringify({}));

    await mockttp
      .post('/graphs/test-graph/revisions')
      .thenReply(200, JSON.stringify({revision: {lock: {}}}));

    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
    ]);
    cli.stdin.end(githubLog, 'utf8');

    // TODO: assert results
    // expect(await read(cli.stdout)).toBe('');

    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });
});
