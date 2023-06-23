import {AirbyteLog, AirbyteLogLevel} from 'faros-airbyte-cdk';
import {readFileSync} from 'fs';
import _ from 'lodash';
import {getLocal} from 'mockttp';

import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {farosFeedsAllStreamsLog} from './data';

describe('faros_feeds', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/faros_feeds/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__faros_feeds__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url);

    await mockttp
      .forPost('/graphs/test-graph/graphql')
      .once()
      .thenReply(
        200,
        readFileSync('test/resources/faros_feeds/schema.json', 'utf8')
      );
  });

  afterEach(async () => {
    await mockttp.stop();
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
    cli.stdin.end(farosFeedsAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      faros_feed: 1004,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();
    const writtenByModel = {
      cicd_ReleaseTagAssociation__Deletion: 1,
      tms_Project__Deletion: 1,
      tms_TaskAssignment__Deletion: 1,
      tms_TaskBoard: 3,
      tms_TaskBoardProjectRelationship: 3,
      tms_TaskBoardProjectRelationship__Deletion: 1,
      vcs_Commit: 34,
      vcs_Label: 2,
      vcs_Membership: 166,
      vcs_PullRequest: 91,
      vcs_PullRequestLabel: 13,
      vcs_PullRequestReview: 437,
      vcs_Tag: 32,
      vcs_User: 217,
    };

    const processedTotal = _(processedByStream).values().sum();
    const writtenTotal = _(writtenByModel).values().sum();
    expect(stdout).toMatch(`Processed ${processedTotal} records`);
    expect(stdout).toMatch(`Would write ${writtenTotal} records`);
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Processed records by stream: ${JSON.stringify(processed)}`
        )
      )
    );
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Would write records by model: ${JSON.stringify(writtenByModel)}`
        )
      )
    );
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });
});
