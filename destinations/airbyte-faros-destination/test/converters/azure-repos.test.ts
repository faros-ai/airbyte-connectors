import {generateBasicTestSuite} from '../../src/testing-tools/utils';

generateBasicTestSuite({
  sourceName: 'azure-repos',
  checkRecordsData: (records) => expect(records).toMatchSnapshot(),
});
