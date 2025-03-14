import {TeamProject} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import * as GitInterfaces from 'azure-devops-node-api/interfaces/GitInterfaces';
import {AzureDevOpsConfig} from 'faros-airbyte-common/azure-devops';

export interface AzureReposConfig extends AzureDevOpsConfig {
  readonly branch_pattern?: string;
}

export interface Tag extends GitInterfaces.GitRef {
  commit?: GitInterfaces.GitAnnotatedTag;
}

export interface Repository extends GitInterfaces.GitRepository {
  project: TeamProject;
  branches?: GitInterfaces.GitBranchStats[];
  tags?: Tag[];
}

export interface PullRequest extends GitInterfaces.GitPullRequest {
  threads: GitInterfaces.GitPullRequestCommentThread[];
}

export interface PullRequestReviewer {
  reviewerUrl: string;
  vote: number;
  hasDeclined: boolean;
  isFlagged: boolean;
  displayName: string;
  url: string;
  id: string;
  uniqueName: string;
  imageUrl: string;
}

export interface Commit extends GitInterfaces.GitCommitRef {
  repository?: Repository;
  branch?: string;
}
