export type QueryType = 'git' | 'awsv2';
export interface QueryHolder {
  queryName: string;
}

const queryTypeToQueryHolder: Record<QueryType, QueryHolder> = {
  git: {
    queryName: 'GithubDependabotVulnerabilityList',
  },
  awsv2: {
    queryName: 'AwsContainerVulnerabilityV2List',
  },
};

export {queryTypeToQueryHolder};
