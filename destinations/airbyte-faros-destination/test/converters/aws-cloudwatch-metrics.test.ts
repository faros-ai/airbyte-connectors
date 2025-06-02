import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {
  initMockttp,
  sourceSpecificTempConfig,
} from 'faros-airbyte-testing-tools';
import {generateBasicTestSuite} from 'faros-airbyte-testing-tools';
import {getLocal} from 'mockttp';

import {
  Metrics,
  MetricsConfig,
} from '../../src/converters/aws-cloudwatch-metrics/metrics';
import {DestinationRecord, StreamContext} from '../../src/converters/converter';
import {awsCloudwatchMetricsStreamsInput} from './data';

describe('AWS Cloudwatch Metrics', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await sourceSpecificTempConfig(mockttp.url, {});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  generateBasicTestSuite({sourceName: 'aws-cloudwatch-metrics'});

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

  test('should use tag configuration', async () => {
    const record = AirbyteRecord.make('metrics', {
      queryName: 'TotalCharacterCount',
      timestamp: '2023-12-11T19:38:00.000Z',
      value: 22,
      label: 'CodeWhisperer',
    });
    for (const should_tag_definition of [false, true, undefined]) {
      const converter = new Metrics();
      const ctx = new StreamContext(
        new AirbyteLogger(),
        {
          edition_configs: {},
          source_specific_configs: {
            aws_cloudwatch_metrics: {
              tag_key: 'tag-key',
              tag_value: 'tag-value',
              should_tag_definition,
            } as MetricsConfig,
          },
        },
        {}
      );
      const res = await converter.convert(record, ctx);
      expect(res).toMatchSnapshot();
    }
  });
});
