export type QueryType = 'git' | 'aws' | 'awsv2';
export interface QueryHolder {
  queryName: string;
}

const queryTypeToQueryHolder: Record<QueryType, QueryHolder> = {
  git: {
    queryName: 'GithubDependabotVulnerabilityList',
  },
  aws: {
    queryName: 'AwsContainerVulnerabilityList',
  },
  awsv2: {
    queryName: 'AwsContainerVulnerabilityV2List',
  },
};

export {queryTypeToQueryHolder};
