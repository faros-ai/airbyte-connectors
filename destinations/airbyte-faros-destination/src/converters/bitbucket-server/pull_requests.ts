import {PullRequests as BitbucketPullRequests} from '../bitbucket/pull_requests';
import {SOURCE} from './common';

export class PullRequests extends BitbucketPullRequests {
  source = SOURCE;
}
