import fs from 'fs';
import {getLocal} from 'mockttp';

import {tempConfig} from '../temp';
import {CLI, read} from './../cli';
import {githubLog, readTestResourceFile} from './data';

describe('github', () => {
  const mockttp = getLocal({debug: false});
  const catalogPath = 'test/resources/github-catalog.json';
  let configPath: string;
  const graphSchema = JSON.parse(readTestResourceFile('graph-schema.json'));
  const revisionId = 'test-revision-id';

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
      .thenReply(
        200,
        JSON.stringify({
          entrySchema: graphSchema,
          revision: {uid: revisionId, lock: {state: {}}},
        })
      );

    await mockttp
      .post(`/graphs/test-graph/revisions/${revisionId}/entries`)
      .thenReply(204);

    await mockttp
      .patch(`/graphs/test-graph/revisions/${revisionId}`)
      .withBody(JSON.stringify({status: 'active'}))
      .thenReply(204);

    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
    ]);
    cli.stdin.end(githubLog, 'utf8');

    // TODO: assert results
    const res = await read(cli.stdout);
    // expect(res).toBe('');
    console.log(res);

    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });
});
