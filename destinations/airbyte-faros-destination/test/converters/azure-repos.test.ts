
generateBasicTestSuite({
  sourceName: 'azure-repos',
  checkRecordsData: (records) => expect(records).toMatchSnapshot(),
});
