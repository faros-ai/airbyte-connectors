export function getQueryToCheckConnection(offset = 0, limit = 1): string {
  return `
    query getExecutions {
      executions(offset: ${offset}, limit: ${limit}) {
        pageInfo {
          total
          hasMore
        }
        nodes {
          id
          status
        }
      }
    }
`;
}

export function getQueryExecution(): string {
  return `
    query getExecutions($offset: Int!, $limit: Int!, $endedAt: DateTime!,
        $appEnvLimit: Int!, $appEnvOffset: Int!,
        $appServiceLimit: Int!, $appServiceOffset: Int!) {
      executions(offset: $offset, limit: $limit, filters: {endTime: {operator: AFTER, value: $endedAt}
      }) {
        pageInfo {
          total
          hasMore
        }
        nodes {
          id
          status

          application {
            id
            name
            tags {
              name
              value
            }
          }
          ... on PipelineExecution {
            startedAt
            endedAt
            application {
              environments(limit: $appEnvLimit, offset: $appEnvOffset) {
                nodes {
                  type
                }
              }
              services(limit: $appServiceLimit, offset: $appServiceOffset) {
                nodes {
                  artifactType
                  artifactSources {
                    name
                  }
                }
              }
            }
          }
          ... on WorkflowExecution {
            startedAt
            endedAt
            artifacts {
              id
              buildNo
              artifactSource {
                id
                name
              }
            }
            outcomes{
              nodes{
                ... on DeploymentOutcome {
                  service{
                    id
                    name
                    artifactType
                    artifactSources {
                      name
                    }
                  }
                  environment{
                    type
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
}

export function getQueryRepositories(): string {
  return `
    query getRepositories($offset: Int!, $limit: Int!, $createdAt: DateTime!) {
      repositories(offset: $offset, limit: $limit, filters: {createdAt: {operator: AFTER, value: $createdAt}}) {
        pageInfo {
          total
          hasMore
        }
        nodes {
          id
          name
          type
          url
          description
          defaultBranch
          createdAt
          updatedAt
          tags {
            name
            value
          }
        }
      }
    }
  `;
}
