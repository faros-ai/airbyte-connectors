import {Converter} from './converter';
import {GithubAssignees} from './github/assignees';
import {GithubCollaborators} from './github/collaborators';
import {GithubCommits} from './github/commits';
import {GithubIssues} from './github/issues';
import {GithubPullRequests} from './github/pull-requests';
import {GithubReviews} from './github/reviews';

/**
 * All known converters.
 *
 * Make sure to add your converter to this list.
 */
export const converters: ReadonlyArray<Converter> = [
  new GithubAssignees(),
  new GithubCollaborators(),
  new GithubCommits(),
  new GithubIssues(),
  new GithubPullRequests(),
  new GithubReviews(),
];
