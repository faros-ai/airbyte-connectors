export type QueryType = 'git' | 'aws' | 'awsv2';
export interface QueryHolder {
  objectName: string;
  query: string;
}

const queryTypeToQueryHolder: Record<QueryType, QueryHolder> = {
  git: {
    objectName: 'GithubDependabotVulnerabilityList',
    query: `
  query VantaQuery($last: Int, $before: String) {
    organization {
      name
      displayName
      GithubDependabotVulnerabilityList(last: $last, before: $before) {
        totalCount
        edges {
          cursor
          node {
           createdAt
           displayName
           externalURL
           repositoryName
           severity
           slaDeadline
           securityAdvisory {
               cveId
               description
               ghsaId
           }
           uid
           vantaDescription
          }
        }
        pageInfo {
          startCursor
        }
      }
    }
   }
  `,
  },
  aws: {
    objectName: 'AwsContainerVulnerabilityList',
    query: `query VantaQuery($last: Int, $before: String) {
    organization {
      name
      displayName
      AwsContainerVulnerabilityList(last: $last, before: $before) {
        totalCount
        edges {
          cursor
          node {
            createdAt
            packageName
            packageVersion
            externalURL
            scanType
            severity
            slaDeadline
            uid
            repositoryName
            repositoryArn
            displayName
            findings {
              description
              providerSeverity
              name
            }
            
          }
        }
      }
    }
  }
  `,
  },
  awsv2: {
    objectName: 'AwsContainerVulnerabilityV2List',
    query: ` query VantaQuery($last: Int, $before: String) {
    organization {
      name
      displayName
      AwsContainerVulnerabilityV2List(last: $last, before: $before) {
        totalCount
        edges {
          cursor
          node {
            createdAt
            externalURL
            packageName
            packageIdentifier
            scanType
            scannerScore
            severity
            uid
            description
            displayName
            name
            isFixable
            remediation
            remediateBy
            asset {
              displayName
            }
            ignored {
              ignoreReason
              ignoredUntil
              ignoredAt
            }
          }
        }
      }
    }
  }
  `,
  },
};

export {queryTypeToQueryHolder};
