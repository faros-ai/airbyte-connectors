import {
  AirbyteLog,
  AirbyteLogLevel,
  AirbyteRecord,
  AirbyteStateMessage,
} from 'faros-airbyte-cdk';
import _ from 'lodash';
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
import {githubAllStreamsLog, githubLog, githubPGRawLog} from './data';
import {assertProcessedAndWrittenModels} from './utils';

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
    configPath = await tempConfig(
      mockttp.url,
      InvalidRecordStrategy.SKIP,
      Edition.CLOUD,
      undefined,
      undefined,
      undefined,
      {vcs_Commit: ['message'], vcs_PullRequest: ['description', 'htmlUrl']}
    );
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
    configPath = await tempConfig(mockttp.url, InvalidRecordStrategy.FAIL);
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
    configPath = await tempConfig(mockttp.url);
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
        new AirbyteStateMessage(
          {data: {}},
          {status: 'ERRORED', error: 'Source error message'}
        )
      ) +
        os.EOL +
        JSON.stringify(
          new AirbyteStateMessage(
            {data: {}},
            {
              status: 'ERRORED',
              error: {
                summary: 'Error from sync message',
                code: 1,
                action: 'test',
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
        ' Airbyte Source errors: Source error message; Error from sync message'
    );
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch('Skipped 0 records');
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });

  test('process records from all streams', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(githubAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      assignees: 12,
      branches: 4,
      collaborators: 12,
      commits: 77,
      issue_labels: 24,
      issue_milestones: 1,
      issues: 39,
      organizations: 1,
      projects: 1,
      pull_request_stats: 38,
      pull_requests: 38,
      pull_request_commits: 3,
      releases: 1,
      repositories: 49,
      review_comments: 87,
      reviews: 121,
      tags: 2,
      users: 24,
      workflows: 3,
      workflow_runs: 1,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      cicd_Build: 1,
      cicd_BuildCommitAssociation: 1,
      cicd_Organization: 1,
      cicd_Pipeline: 3,
      cicd_Release: 1,
      cicd_ReleaseTagAssociation: 1,
      tms_Epic: 1,
      tms_Label: 24,
      tms_Project: 50,
      tms_Task: 1,
      tms_TaskBoard: 50,
      tms_TaskBoardProjectRelationship: 50,
      tms_TaskBoardRelationship: 1,
      tms_TaskTag: 2,
      tms_User: 13,
      vcs_Branch: 4,
      vcs_BranchCommitAssociation: 1,
      vcs_Commit: 77,
      vcs_Membership: 12,
      vcs_Organization: 1,
      vcs_PullRequest: 38,
      vcs_PullRequestComment: 87,
      vcs_PullRequestCommit: 3,
      vcs_PullRequestReview: 121,
      vcs_PullRequest__Update: 38,
      vcs_Repository: 49,
      vcs_Tag: 2,
      vcs_User: 195,
    };

    await assertProcessedAndWrittenModels(
      processedByStream,
      writtenByModel,
      stdout,
      processed,
      cli
    );
  });
});
