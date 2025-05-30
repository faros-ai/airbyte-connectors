import {generateBasicTestSuite} from '@faros-ai/airbyte-testing-tools';

generateBasicTestSuite({
  sourceName: 'azure-repos',
  checkRecordsData: (records) => expect(records).toMatchSnapshot(),
});
