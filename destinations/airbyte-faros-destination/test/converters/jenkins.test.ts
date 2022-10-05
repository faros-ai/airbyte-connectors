import {AirbyteLog, AirbyteLogLevel} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal} from 'mockttp';
import {Dictionary} from 'ts-essentials';

import {Edition, InvalidRecordStrategy} from '../../src';
import {CLI, read} from '../cli';
import {initMockttp, tempConfig, testLogger} from '../testing-tools';
import {jenkinsAllStreamsLog} from './data';

describe('jenkins', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/jenkins/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__jenkins__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig(mockttp.url);
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  async function testStreams(
    processedByStream: Dictionary<number>,
    writtenByModel: Dictionary<number>
  ): Promise<void> {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(jenkinsAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const processedTotal = _(processedByStream).values().sum();
    const writtenTotal = _(writtenByModel).values().sum();
    expect(stdout).toMatch(`Processed ${processedTotal} records`);
    expect(stdout).toMatch(`Would write ${writtenTotal} records`);
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch('Skipped 0 records');
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
  }

  test('process records from all streams', async () => {
    const processedByStream = {
      jobs: 2,
      builds: 4,
    };
    const writtenByModel = {
      cicd_Build: 4,
      cicd_BuildCommitAssociation: 1,
      cicd_Organization: 6,
      cicd_Pipeline: 6,
    };
    await testStreams(processedByStream, writtenByModel);
  });

  test('process records from all streams with commits', async () => {
    configPath = await tempConfig(
      mockttp.url,
      InvalidRecordStrategy.SKIP,
      Edition.CLOUD,
      {},
      {
        jenkins: {
          create_commit_records: true,
        },
      }
    );
    const processedByStream = {
      jobs: 2,
      builds: 4,
    };
    const writtenByModel = {
      cicd_Build: 4,
      cicd_BuildCommitAssociation: 1,
      cicd_Organization: 6,
      cicd_Pipeline: 6,
      vcs_Commit: 1,
    };
    await testStreams(processedByStream, writtenByModel);
  });
});
