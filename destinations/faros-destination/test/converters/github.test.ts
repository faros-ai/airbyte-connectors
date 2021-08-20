import fs from 'fs';
import {getLocal} from 'mockttp';

import {tempConfig} from '../temp';
import {CLI, read} from './../cli';
import {githubLog, readTestResourceFile} from './data';

describe('github', () => {
  const mockttp = getLocal({debug: false, recordTraffic: true});
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
      .once()
      .thenReply(200, JSON.stringify({}));

    await mockttp
      .post('/graphs/test-graph/revisions')
      .once()
      .thenReply(
        200,
        JSON.stringify({
          entrySchema: graphSchema,
          revision: {uid: revisionId, lock: {state: {}}},
        })
      );

    const revisionEntries = await mockttp
      .post(`/graphs/test-graph/revisions/${revisionId}/entries`)
      .thenReply(204);

    const closeRevision = await mockttp
      .patch(`/graphs/test-graph/revisions/${revisionId}`)
      .withBody(JSON.stringify({status: 'active'}))
      .once()
      .thenReply(204);

    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
    ]);
    cli.stdin.end(githubLog, 'utf8');

    const stdout = await read(cli.stdout);
    console.log(stdout);
    expect(stdout).toMatch('Processed 82 records');
    expect(stdout).toMatch('Wrote 13 records');

    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);

    const entries = await revisionEntries.getSeenRequests();
    entries.forEach(async (r) =>
      console.log((await r.body.getDecodedBuffer()).length)
    );

    const closeRevisionEntries = await closeRevision.getSeenRequests();
    closeRevisionEntries.forEach(async (r) =>
      console.log(await r.body.getJson())
    );
  });
});
