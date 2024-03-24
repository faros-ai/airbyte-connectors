const queryTypeToQuery = {
  git: `
  query MyQuery($last: Int, $before: String) {
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
  aws: `
  query MyQuery($last: Int, $before: String) {
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
  awsv2: `
  query AWSContainerV2($last: Int, $before: String) {
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
};

export {queryTypeToQuery};
