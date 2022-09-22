import {Repositories as BitbucketRepositories} from '../bitbucket/repositories';
import {SOURCE} from './common';

export class Repositories extends BitbucketRepositories {
  source = SOURCE;
}
