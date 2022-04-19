import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {Converter, DestinationRecord} from '../converter';

export interface CategoryRef {
  readonly category: string;
  readonly detail: string;
}

interface OrgKey {
  uid: string;
  source: string;
}

interface RepositoryKey {
  name: string;
  uid: string;
  organization: OrgKey;
}

/** Common functions shares across GitLab converters */
export class GitlabCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

  static tms_ProjectBoard_with_TaskBoard(
    projectKey: ProjectKey,
    name: string,
    description: string | null,
    createdAt: string | null | undefined,
    updatedAt: string | null | undefined
  ): DestinationRecord[] {
    return [
      {
        model: 'tms_Project',
        record: {
          ...projectKey,
          name: name,
          description: description?.substring(
            0,
            GitlabCommon.MAX_DESCRIPTION_LENGTH
          ),
          createdAt: Utils.toDate(createdAt),
          updatedAt: Utils.toDate(updatedAt),
        },
      },
      {
        model: 'tms_TaskBoard',
        record: {
          ...projectKey,
          name,
        },
      },
      {
        model: 'tms_TaskBoardProjectRelationship',
        record: {
          board: projectKey,
          project: projectKey,
        },
      },
    ];
  }

  static parseRepositoryKey(
    webUrl: string | undefined,
    source: string,
    startIndex = 3
  ): undefined | RepositoryKey {
    if (!webUrl) return undefined;
    const repositoryIndex = startIndex + 1;

    const orgRepo: ReadonlyArray<string> = webUrl.split('/');
    if (orgRepo.length < repositoryIndex) return undefined;

    const organization = orgRepo[startIndex];
    const repositoryName = orgRepo[repositoryIndex];
    return {
      name: repositoryName?.toLowerCase(),
      uid: repositoryName?.toLowerCase(),
      organization: {uid: organization?.toLowerCase(), source},
    };
  }

  // GitLab defined status for:
  // >> pipelines (aka builds): created, waiting_for_resource, preparing, pending,
  //    running, success, failed, canceled, skipped, manual, scheduled
  // >> jobs: created, pending, running, failed, success, canceled, skipped, or manual.
  static convertBuildStatus(status?: string): CategoryRef {
    if (!status) {
      return {category: 'Unknown', detail: 'undefined'};
    }
    const detail = status?.toLowerCase();
    switch (detail) {
      case 'canceled':
        return {category: 'Canceled', detail};
      case 'failed':
        return {category: 'Failed', detail};
      case 'running':
        return {category: 'Running', detail};
      case 'success':
        return {category: 'Success', detail};
      case 'created':
      case 'manual':
      case 'pending':
      case 'preparing':
      case 'scheduled':
      case 'waiting_for_resource':
        return {category: 'Queued', detail};
      case 'skipped':
      default:
        return {category: 'Custom', detail};
    }
  }
}

/** GitLab converter base */
export abstract class GitlabConverter extends Converter {
  source = 'GitLab';

  /** Almost every GitLab record have id property. Function will be
   * override if record doesn't have id property.
   */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}

export interface ProjectKey {
  uid: string;
  source: string;
}
