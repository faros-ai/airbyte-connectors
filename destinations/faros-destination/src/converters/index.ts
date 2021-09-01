import {Converter} from './converter';
import {GithubAssignees} from './github/assignees';
import {GithubBranches} from './github/branches';
import {GithubCollaborators} from './github/collaborators';
import {GithubComments} from './github/comments';
import {GithubCommitComments} from './github/commit-comments';
import {GithubCommits} from './github/commits';
import {GithubEvents} from './github/events';
import {GithubIssueEvents} from './github/issue-events';
import {GithubIssueLabels} from './github/issue-labels';
import {GithubIssueMilestones} from './github/issue-milestones';
import {GithubIssues} from './github/issues';
import {GithubOrganizations} from './github/organizations';
import {GithubProjects} from './github/projects';
import {GithubPullRequestStats} from './github/pull-request-stats';
import {GithubPullRequests} from './github/pull-requests';
import {GithubReleases} from './github/releases';
import {GithubRepositories} from './github/repositories';
import {GithubReviewComments} from './github/review-comments';
import {GithubReviews} from './github/reviews';
import {GithubStargazers} from './github/stargazers';
import {GithubTags} from './github/tags';
import {GithubTeams} from './github/teams';
import {GithubUsers} from './github/users';

/**
 * All known converters.
 *
 * Make sure to add your converter to this list.
 */
export const converters: ReadonlyArray<Converter> = [
  new GithubAssignees(),
  new GithubBranches(),
  new GithubCollaborators(),
  new GithubComments(),
  new GithubCommitComments(),
  new GithubCommits(),
  new GithubEvents(),
  new GithubIssueEvents(),
  new GithubIssueLabels(),
  new GithubIssueMilestones(),
  new GithubIssues(),
  new GithubOrganizations(),
  new GithubProjects(),
  new GithubPullRequestStats(),
  new GithubPullRequests(),
  new GithubReleases(),
  new GithubRepositories(),
  new GithubReviewComments(),
  new GithubReviews(),
  new GithubStargazers(),
  new GithubTags(),
  new GithubTeams(),
  new GithubUsers(),
];
