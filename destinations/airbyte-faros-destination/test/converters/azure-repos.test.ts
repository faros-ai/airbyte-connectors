import {generateBasicTestSuite} from './utils';

generateBasicTestSuite({
  sourceName: 'azure-repos',
  checkRecordsData: (records) => expect(records).toMatchSnapshot(),
});
