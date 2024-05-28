import {AirbyteRecord, AirbyteSourceStatusMessage} from 'faros-airbyte-cdk';
import {getLocal} from 'mockttp';
import os from 'os';

import {Edition, InvalidRecordStrategy} from '../../src';
import {GitHubCommon} from '../../src/converters/github/common';
import {CLI, read} from '../cli';
import {
  initMockttp,
  readTestResourceFile,
  tempConfig,
  testLogger,
} from '../testing-tools';
import {githubLog, githubPGRawLog} from './data';
import {destinationWriteTest} from './utils';

describe('github', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/github/catalog.json';
  const catalogRawPath = 'test/resources/github/catalog-raw.json';
  let configPath: string;
  const graphSchema = JSON.parse(readTestResourceFile('graph-schema.json'));
  const revisionId = 'test-revision-id';
  const streamNamePrefix = 'mytestsource__github__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      invalid_record_strategy: InvalidRecordStrategy.SKIP,
      edition: Edition.CLOUD,
      edition_configs: undefined,
      source_specific_configs: undefined,
      replace_origin_map: undefined,
      exclude_fields_map: {
        vcs_Commit: ['message'],
        vcs_PullRequest: ['description', 'htmlUrl'],
      },
    });
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('build vcsUser', async () => {
    expect(GitHubCommon.vcs_User({type: 'Bot'}, 'mysource')).toBeUndefined();
  });

  test('process and write records', async () => {
    await mockttp
      .forPost('/graphs/test-graph/models')
      .withQuery({schema: 'canonical'})
      .once()
      .thenReply(200, JSON.stringify({}));

    await mockttp
      .forPost('/graphs/test-graph/revisions')
      .once()
      .thenReply(
        200,
        JSON.stringify({
          entrySchema: graphSchema,
          revision: {uid: revisionId, lock: {state: {}}},
        })
      );

    let entriesSize = 0;
    await mockttp
      .forPost(`/graphs/test-graph/revisions/${revisionId}/entries`)
      .thenCallback(async (r) => {
        entriesSize = r.body.buffer.length;
        return {statusCode: 204};
      });

    await mockttp
      .forPatch(`/graphs/test-graph/revisions/${revisionId}`)
      .withJsonBodyIncluding({status: 'active'})
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
    logger.debug(stdout);
    expect(stdout).toMatch('\\"api_key\\":\\"REDACTED\\"');
    expect(stdout).toMatch('Read 110 messages');
    expect(stdout).toMatch('Read 96 records');
    expect(stdout).toMatch('Processed 96 records');
    expect(stdout).toMatch('Wrote 58 records');
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch('Skipped 0 records');
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
    expect(entriesSize).toBeGreaterThan(0);
  });

  test('process records but skip writes when dry run is enabled', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(githubLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Read 110 messages');
    expect(stdout).toMatch('Read 96 records');
    expect(stdout).toMatch('Processed 96 records');
    expect(stdout).toMatch('Would write 58 records');
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch('Skipped 0 records');
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });

  test('process raw records', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogRawPath,
      '--dry-run',
    ]);
    cli.stdin.end(githubPGRawLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Processed 111 records');
    expect(stdout).toMatch('Would write 146 records');
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch('Skipped 0 records');
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });

  test('skip to process bad records when strategy is SKIP', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(
      JSON.stringify(
        AirbyteRecord.make('mytestsource__github__bad', {bad: 'dummy'})
      ) +
        os.EOL +
        JSON.stringify(
          AirbyteRecord.make('mytestsource__github__assignees', {
            login: 'xyz',
          })
        ) +
        os.EOL,
      'utf8'
    );
    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Processed 1 records');
    expect(stdout).toMatch('Would write 1 records');
    expect(stdout).toMatch('Errored 1 records');
    expect(stdout).toMatch('Skipped 1 records');
    expect(await read(cli.stderr)).toMatch('');
    expect(await cli.wait()).toBe(0);
  });

  test('fail to process bad records when strategy is FAIL', async () => {
    configPath = await tempConfig({
      api_url: mockttp.url,
      invalid_record_strategy: InvalidRecordStrategy.FAIL,
    });
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(
      JSON.stringify(
        AirbyteRecord.make('mytestsource__github__bad', {bad: 'dummy'})
      ) + os.EOL,
      'utf8'
    );
    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Processed 0 records');
    expect(stdout).toMatch('Would write 0 records');
    expect(stdout).toMatch('Errored 1 records');
    expect(stdout).toMatch('Skipped 0 records');
    expect(stdout).toMatch('Undefined stream mytestsource__github__bad');
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBeGreaterThan(0);
  });

  test('skip non-incremental model reset if Source failure detected', async () => {
    configPath = await tempConfig({api_url: mockttp.url});
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(
      JSON.stringify(
        new AirbyteSourceStatusMessage(
          {data: {}},
          {
            status: 'RUNNING',
            message: {
              summary: 'Source error message',
              code: 0,
              action: 'test',
              type: 'ERROR',
            },
          }
        )
      ) +
        os.EOL +
        JSON.stringify(
          new AirbyteSourceStatusMessage(
            {data: {}},
            {
              status: 'ERRORED',
              message: {
                summary: 'Error from sync message',
                code: 1,
                action: 'test',
                type: 'ERROR',
              },
            }
          )
        ),
      'utf8'
    );
    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Read 2 messages');
    expect(stdout).toMatch('Processed 0 records');
    expect(stdout).toMatch('Would write 0 records');
    expect(stdout).toMatch(
      'Skipping reset of non-incremental models due to' +
        ' Airbyte Source errors: Error from sync message; Source error message'
    );
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch('Skipped 0 records');
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/github/catalog.json',
      inputRecordsPath: 'github/all-streams.log',
    });
  });
});
