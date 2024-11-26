import {generateBasicTestSuite} from './utils';

generateBasicTestSuite({
  sourceName: 'azurepipeline',
  checkRecordsData: (records) => expect(records).toMatchSnapshot(),
});
