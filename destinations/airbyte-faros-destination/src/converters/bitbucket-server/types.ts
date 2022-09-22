import {User} from '../bitbucket/types';

export interface ProjectUser {
  readonly user: User;
  readonly project: {readonly slug: string};
}
