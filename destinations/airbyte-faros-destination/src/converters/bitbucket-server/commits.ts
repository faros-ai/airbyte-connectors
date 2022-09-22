import {Commits as BitbucketCommits} from '../bitbucket/commits';
import {SOURCE} from './common';

export class Commits extends BitbucketCommits {
  source = SOURCE;
}
