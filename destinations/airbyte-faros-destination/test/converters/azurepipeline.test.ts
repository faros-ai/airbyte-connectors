import {generateBasicTestSuite} from 'faros-airbyte-testing-tools';
generateBasicTestSuite({
  sourceName: 'azurepipeline',
  checkRecordsData: (records) => expect(records).toMatchSnapshot(),
});
