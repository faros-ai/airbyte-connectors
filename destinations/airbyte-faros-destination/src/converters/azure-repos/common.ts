import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';
import {
  CommitRepository,
  PullRequestReviewState,
  PullRequestReviewStateCategory,
  PullRequestState,
  PullRequestStateCategory,
} from './models';

export const MAX_DESCRIPTION_LENGTH = 1000;

export type ApplicationMapping = Record<
  string,
  {name: string; platform?: string}
>;

// Partial user objects from streams that aren't the Users stream
export interface PartialUserRecord {
  uid: string;
  name: string;
  email?: string;
}

/** Azurerepos converter base */
export abstract class AzureReposConverter extends Converter {
  source = 'Azure-Repos';
  /** Almost every Azurerepos record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  getOrganizationFromUrl(url: string): string {
    return url.split('/')[3];
  }

  // Records from Users stream have more populated fields than user objects from
  // other streams, so prioritize upserting those over partial duplicates from
  // other streams
  private static readonly _uidsFromUsersStream: Set<string> = new Set();
  public get uidsFromUsersStream(): Set<string> {
    return AzureReposConverter._uidsFromUsersStream;
  }

  /**
   * Azure repos have an additional hierarchy called 'project'.
   * Repository names are not unique across projects so we must include
   * the project name to make sure there are no collisions.
   *
   * @param repository  The repository info which contains project info
   * @returns           The identifier for a repo unique across projects
   */
  getProjectRepo(repository: CommitRepository): string {
    return `${repository?.project?.name}_${repository?.name}`;
  }

  convertStringToNumber(str: string): number {
    const lastString = str.split('-')[str.split('-').length - 1];
    const onlyNumbers = lastString.replace(/[^\d.-]/g, '');
    return Number(onlyNumbers);
  }
  //https://docs.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/get-pull-requests?view=azure-devops-rest-4.1#pullrequeststatus
  convertPullRequestState(status: string): PullRequestState {
    switch (status) {
      case 'completed':
        return {
          category: PullRequestStateCategory.Closed,
          detail: status,
        };
      case 'active':
        return {
          category: PullRequestStateCategory.Merged,
          detail: status,
        };
      case 'notSet':
        return {
          category: PullRequestStateCategory.Open,
          detail: status,
        };
      default:
        return {
          category: PullRequestStateCategory.Custom,
          detail: status,
        };
    }
  }

  convertPullRequestReviewState(vote: number): PullRequestReviewState {
    if (vote > 5)
      return {
        category: PullRequestReviewStateCategory.Approved,
        detail: `vote ${vote}`,
      };
    if (vote > 0)
      return {
        category: PullRequestReviewStateCategory.Commented,
        detail: `vote ${vote}`,
      };
    if (vote > -5)
      return {
        category: PullRequestReviewStateCategory.Custom,
        detail: `vote ${vote}`,
      };
    return {
      category: PullRequestReviewStateCategory.Dismissed,
      detail: `vote ${vote}`,
    };
  }
}
