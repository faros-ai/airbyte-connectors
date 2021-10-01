import {AirbyteRecord} from 'faros-airbyte-cdk/src/protocol';
import { Dictionary } from 'ts-essentials';

import {Converter, DestinationRecord} from '../converter';

interface TmsTaskType {
  category: TmsTaskCategory;
  detail: string;
}

enum TmsTaskCategory {
  Bug = 'Bug',
  Custom = 'Custom',
  Story = 'Story',
  Task = 'Task',
}

/** Common functions shares across Asana converters */
export class AsanaCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;

  

  // Max length for free-form description text fields such as issue body
  // static readonly MAX_DESCRIPTION_LENGTH = 1000;

  // static vcs_User_with_Membership(
  //   user: Dictionary<any>,
  //   source: string
  // ): DestinationRecord[] {
  //   const vcsUser = GithubCommon.vcs_User(user, source);
  //   const repository = GithubCommon.parseRepositoryKey(user.repository, source);

  //   if (!repository) return [vcsUser];

  //   const vcsMembership = GithubCommon.vcs_Membership(
  //     vcsUser.record.uid,
  //     repository.organization.uid,
  //     repository.organization.source
  //   );
  //   return [vcsUser, vcsMembership];
  // }

  static toTmsTaskType(type: string): TmsTaskType {
    const detail = type.toLowerCase();
    switch (detail) {
      case 'bug':
        return {category: TmsTaskCategory.Bug, detail};
      case 'story':
        return {category: TmsTaskCategory.Story, detail};
      case 'task':
        return {category: TmsTaskCategory.Task, detail};
      default:
        return {category: TmsTaskCategory.Custom, detail};
    }
  }

  static tms_User(user: Dictionary<any>, source: string): DestinationRecord {
    return {
      model: 'tms_User',
      record: {
        uid: user.gid,
        name: user.name ?? null,
        source,
      },
    };
  }

  // static vcs_Membership(
  //   userUid: string,
  //   org: string,
  //   source: string
  // ): DestinationRecord {
  //   return {
  //     model: 'vcs_Membership',
  //     record: {
  //       user: {uid: userUid, source},
  //       organization: {uid: toLower(org), source},
  //     },
  //   };
  // }

  // static tms_User(user: Dictionary<any>, source: string): DestinationRecord {
  //   return {
  //     model: 'tms_User',
  //     record: {
  //       uid: user.login,
  //       name: user.name ?? user.login ?? null,
  //       source,
  //     },
  //   };
  // }

  // static tms_ProjectBoard_with_TaskBoard(
  //   projectKey: ProjectKey,
  //   name: string,
  //   description: string | null,
  //   createdAt: string | null | undefined,
  //   updatedAt: string | null | undefined
  // ): DestinationRecord[] {
  //   return [
  //     {
  //       model: 'tms_Project',
  //       record: {
  //         ...projectKey,
  //         name: name,
  //         description: description?.substring(
  //           0,
  //           GithubCommon.MAX_DESCRIPTION_LENGTH
  //         ),
  //         createdAt: Utils.toDate(createdAt),
  //         updatedAt: Utils.toDate(updatedAt),
  //       },
  //     },
  //     {
  //       model: 'tms_TaskBoard',
  //       record: {
  //         ...projectKey,
  //         name,
  //       },
  //     },
  //     {
  //       model: 'tms_TaskBoardProjectRelationship',
  //       record: {
  //         board: projectKey,
  //         project: projectKey,
  //       },
  //     },
  //   ];
  // }

  // static parseRepositoryKey(
  //   repository: string,
  //   source: string
  // ): undefined | RepositoryKey {
  //   if (!repository) return undefined;

  //   const orgRepo: ReadonlyArray<string> = repository.split('/');
  //   if (orgRepo.length != 2) return undefined;

  //   const [organization, repositoryName] = orgRepo;
  //   return {
  //     name: toLower(repositoryName),
  //     organization: {uid: toLower(organization), source},
  //   };
  // }

  // static parsePRnumber(pull_request_url: string): number {
  //   return Utils.parseInteger(
  //     pull_request_url.substring(pull_request_url.lastIndexOf('/') + 1)
  //   );
  // }
}

/** Asana converter base */
export abstract class AsanaConverter extends Converter {
  /** All Asana records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.gid;
  }
}
