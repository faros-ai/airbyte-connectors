import {AirbyteRecord} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {getLocal} from 'mockttp';

import {Metrics} from '../../src/converters/aws-cloudwatch-metrics/metrics';
import {DestinationRecord} from '../../src/converters/converter';
import {CLI, read} from '../cli';
import {
  initMockttp,
  sourceSpecificTempConfig,
  testLogger,
} from '../testing-tools';
import {
  awsCloudwatchMetricsStreamsInput,
  awsCloudwatchMetricsStreamsLog,
} from './data';
import {assertProcessedAndWrittenModels} from './utils';

describe('AWS Cloudwatch Metrics', () => {
  const logger = testLogger();
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/aws-cloudwatch-metrics/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'aws-cloudwatch-metrics__';

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await sourceSpecificTempConfig(mockttp.url, {});
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
    cli.stdin.end(awsCloudwatchMetricsStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      metrics: 4,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      faros_MetricDefinition: 2,
      faros_MetricValue: 4,
    };

    await assertProcessedAndWrittenModels(
      processedByStream,
      writtenByModel,
      stdout,
      processed,
      cli
    );
  });

  test('should correctly convert records', async () => {
    const converter = new Metrics();

    const inputRecords: AirbyteRecord[] = JSON.parse(
      awsCloudwatchMetricsStreamsInput
    );

    const outputRecords: DestinationRecord[] = [];

    for (const record of inputRecords) {
      const convertedRecords = await converter.convert(record);
      outputRecords.push(...convertedRecords);
    }

    expect(outputRecords).toMatchSnapshot();
  });
});