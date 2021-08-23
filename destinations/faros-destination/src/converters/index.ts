import {Converter} from './converter';
import {GithubAssignees} from './github/assignees';
import {GithubCollaborators} from './github/collaborators';
import {GithubCommits} from './github/commits';
import {GithubPullRequests} from './github/pull-requests';

/**
 * All known converters.
 *
 * Make sure to add your converter to this list.
 */
export const converters: ReadonlyArray<Converter> = [
  new GithubAssignees(),
  new GithubCollaborators(),
  new GithubCommits(),
  new GithubPullRequests(),
];
