export type QueryType = 'gitv2' | 'awsv2';
export interface QueryHolder {
  queryName: string;
}

const queryTypeToQueryHolder: Record<QueryType, QueryHolder> = {
  gitv2: {
    queryName: 'GithubDependabotVulnerabilityV2List',
  },
  awsv2: {
    queryName: 'AwsContainerVulnerabilityV2List',
  },
};

export {queryTypeToQueryHolder};
