import {generateBasicTestSuite} from 'faros-airbyte-testing-tools';
generateBasicTestSuite({
  sourceName: 'azure-repos',
  checkRecordsData: (records) => expect(records).toMatchSnapshot(),
});
