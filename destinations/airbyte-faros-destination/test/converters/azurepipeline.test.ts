
generateBasicTestSuite({
  sourceName: 'azurepipeline',
  checkRecordsData: (records) => expect(records).toMatchSnapshot(),
});
