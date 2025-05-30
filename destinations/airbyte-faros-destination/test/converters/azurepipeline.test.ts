import {generateBasicTestSuite} from '@faros-ai/airbyte-testing-tools';

generateBasicTestSuite({
  sourceName: 'azurepipeline',
  checkRecordsData: (records) => expect(records).toMatchSnapshot(),
});
