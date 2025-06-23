import {AirbyteRecord} from 'faros-airbyte-cdk';
import {DriveActivityEvent} from 'faros-airbyte-common/googledrive';

import {DestinationModel, DestinationRecord} from '../converter';
import {GoogleDriveConverter} from './common';
import { digest } from 'faros-airbyte-common/common';

enum ActionType {
  Create = 'create',
  Edit = 'edit',
  Move = 'move',
  Rename = 'rename',
  Delete = 'delete',
  Restore = 'restore',
  PermissionChange = 'permissionChange',
  Comment = 'comment',
  Custom = 'custom',
}

export class Activity extends GoogleDriveConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'dms_Document',
    'dms_Activity',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const activity = record.record.data as DriveActivityEvent;

    const res: DestinationRecord[] = [];

    const action = Object.keys(activity.primaryActionDetail || {})[0];
    const userId = activity.actors?.[0]?.user?.knownUser?.personName?.split('people/')[1];
    const target = activity.targets?.[0];
    const driveItem = target?.driveItem || target?.fileComment?.parent;
    const isFile = !!driveItem?.driveFile;

    if (!action || !userId || !driveItem || !isFile) {
      return res;
    }

    const itemId = driveItem.name.split('items/')[1];
    const documentKey = {
      uid: itemId,
      source,
    };
    res.push(
      {
        model: 'dms_Document',
        record: {
          ...documentKey,
          title: driveItem.title,
          type: this.getDocumentType(driveItem.mimeType),
          ...(action === ActionType.Create && {createdAt: activity.timestamp}),
        },
      },
      {
        model: 'dms_Activity',
        record: {
          uid: digest([action, userId, itemId, activity.timestamp].join('__')),
          source,
          timestamp: activity.timestamp,
          document: documentKey,
          user: {
            uid: userId,
            source,
          },
          type: this.getActivityType(action),
        },
      }
    );

    return res;
  }

  private getDocumentType(mimeType?: string): {category: string; detail?: string} {
    if ([
      'application/vnd.google-apps.spreadsheet',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ].includes(mimeType)) {
      return {category: 'Spreadsheet', detail: mimeType};
    }
    if ([
      'application/vnd.google-apps.document',
      'application/vnd.ms-word',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
    ].includes(mimeType)) {
      return {category: 'Document', detail: mimeType};
    }
    if ([
      'application/vnd.google-apps.presentation', 
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ].includes(mimeType)) {
      return {category: 'Presentation', detail: mimeType};
    }
    return {category: 'Custom', detail: mimeType};
  }

  private getActivityType(action?: string): {category: string; detail?: string} {
    if (action === ActionType.Create) {
      return {category: 'Create', detail: action};
    }
    if (action === ActionType.Edit) {
      return {category: 'Edit', detail: action};
    }
    if (action === ActionType.Move) {
      return {category: 'Move', detail: action};
    }
    if (action === ActionType.Rename) {
      return {category: 'Rename', detail: action};
    }
    if (action === ActionType.Delete) {
      return {category: 'Delete', detail: action};
    }
    if (action === ActionType.Restore) {
      return {category: 'Restore', detail: action};
    }
    if (action === ActionType.PermissionChange) {
      return {category: 'PermissionChange', detail: action};
    }
    if (action === ActionType.Comment) {
      return {category: 'Comment', detail: action};
    }
    return {category: 'Custom', detail: action};
  }
}
