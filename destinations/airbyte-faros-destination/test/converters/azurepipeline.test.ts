import {generateBasicTestSuite} from '../../src/testing-tools/utils';

generateBasicTestSuite({
  sourceName: 'azurepipeline',
  checkRecordsData: (records) => expect(records).toMatchSnapshot(),
});
