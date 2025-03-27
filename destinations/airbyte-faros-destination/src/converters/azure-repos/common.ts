import {GitRepository} from 'azure-devops-node-api/interfaces/GitInterfaces';
import {AirbyteRecord} from 'faros-airbyte-cdk';

import {OrgKey,RepoKey} from '../common/vcs';
import {Converter} from '../converter';

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

  // Records from Users stream have more populated fields than user objects from
  // other streams, so prioritize upserting those over partial duplicates from
  // other streams
  private static readonly _uidsFromUsersStream: Set<string> = new Set();
  public get uidsFromUsersStream(): Set<string> {
    return AzureReposConverter._uidsFromUsersStream;
  }

  // Store commit change counts to be used in pull requests stream
  private static readonly _commitChangeCounts: Record<string, number> = {};
  public get commitChangeCounts(): Record<string, number> {
    return AzureReposConverter._commitChangeCounts;
  }

  /**
   * Azure repos have an additional hierarchy called 'project'.
   * Repository names are not unique across projects so we must include
   * the project name to make sure there are no collisions.
   *
   * @param repository  The repository info which contains project info
   * @returns           The identifier for a repo unique across projects
   */
  getProjectRepo(repository: GitRepository, organization: OrgKey): RepoKey {
    const name = `${repository?.project?.name}:${repository?.name}`;
    return {
      name,
      uid: name,
      organization,
    };
  }

  convertStringToNumber(str: string): number {
    const lastString = str.split('-')[str.split('-').length - 1];
    const onlyNumbers = lastString.replace(/[^\d.-]/g, '');
    return Number(onlyNumbers);
  }
}
