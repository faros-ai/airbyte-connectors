import {AirbyteRecord, DestinationSyncMode} from 'faros-airbyte-cdk';
import {paginatedQueryV2, Utils} from 'faros-js-client';
import {isNil} from 'lodash';
import _ from 'lodash';

import {
  DestinationModel,
  DestinationRecord,
  parseObjectConfig,
  StreamContext,
  StreamName,
} from '../converter';
import {TrelloConverter} from './common';
import {Action, Card, Label} from './models';

interface TmsTaskStatus {
  category: Tms_TaskStatusCategory;
  detail: string;
}

interface TmsTaskStatusChange {
  status: TmsTaskStatus;
  changedAt: Date;
}

enum Tms_TaskStatusCategory {
  Custom = 'Custom',
  Done = 'Done',
  InProgress = 'InProgress',
  Todo = 'Todo',
}

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

export interface TrelloConfig {
  task_status_category_mapping?: Record<string, string>;
}

export class Cards extends TrelloConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskProjectRelationship',
    'tms_TaskBoardRelationship',
    'tms_TaskDependency',
    'tms_TaskAssignment',
    'tms_TaskTag',
  ];

  private config: TrelloConfig = undefined;

  private initialize(ctx: StreamContext): void {
    this.config =
      this.config ?? ctx.config.source_specific_configs?.trello ?? {};
    this.config.task_status_category_mapping =
      this.config.task_status_category_mapping ??
      parseObjectConfig(
        this.config?.task_status_category_mapping,
        'Task Status Category Mapping'
      ) ??
      {};
  }

  static readonly actionsStream = new StreamName('trello', 'actions');
  static readonly labelsStream = new StreamName('trello', 'labels');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [Cards.actionsStream, Cards.labelsStream];
  }

  private seenCards: Map<string, Card> = new Map();
  private createActions: Map<string, Action> = new Map();
  private updateActions: Map<string, Array<Action>> = new Map();
  private createdCards: Set<string> = new Set();
  private updatedCards: Set<string> = new Set();
  private deletedCards: Set<string> = new Set();
  private labelNames: Map<string, string> = new Map();

  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    this.initialize(ctx);
    const card = record.record.data as Card;
    this.seenCards.set(card.id, card);
    return [];
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const actionCards: Set<string> = new Set();

    for (const record of Object.values(
      ctx.getAll(Cards.actionsStream.asString)
    )) {
      const action = record.record?.data as Action;
      const cardId = action?.data?.card?.id;
      if (!cardId) {
        continue;
      }
      actionCards.add(cardId);

      const curActions = this.updateActions.get(cardId) ?? [];

      switch (action.type) {
        case 'createCard':
          this.createdCards.add(cardId);
          this.createActions.set(cardId, action);
          break;
        case 'deleteCard':
          this.deletedCards.add(cardId);
          break;
        case 'updateCard':
          this.updatedCards.add(cardId);
          curActions.push(action);
          this.updateActions.set(cardId, curActions);
          break;
        default:
          continue;
      }
    }

    for (const record of Object.values(
      ctx.getAll(Cards.labelsStream.asString)
    )) {
      const label = record.record?.data as Label;
      this.labelNames.set(label.id, label.name);
    }

    const res: DestinationRecord[] = [];

    for (const cardId of actionCards) {
      const cardRecords = await this.processCard(cardId, ctx);
      res.push(...cardRecords);
    }

    return res;
  }

  private async processCard(
    cardId: string,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const isCreated = this.createdCards.has(cardId);
    const isUpdated = this.updatedCards.has(cardId);
    const isDeleted = this.deletedCards.has(cardId);

    if (isDeleted) {
      if (isCreated) {
        // Card was created and then deleted within the same sync window, so we don't need to persist it
        return [];
      } else {
        // Card was deleted, so we need to delete it from the graph
        return await this.processDelete(cardId);
      }
    }

    if (isCreated) {
      return await this.processCreate(cardId);
    }

    if (isUpdated) {
      return await this.processUpdate(cardId, ctx);
    }

    return [];
  }

  private async processCreate(
    cardId: string
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const card = this.seenCards.get(cardId);
    if (!card) {
      return [];
    }

    const res: DestinationRecord[] = [];

    const taskKey = {uid: card.id, source: this.source};
    const statusChangelog: TmsTaskStatusChange[] =
      this.getStatusChangelog(cardId);

    res.push({
      model: 'tms_Task',
      record: {
        ...taskKey,
        name: card.name,
        description: Utils.cleanAndTruncate(card.desc) ?? null,
        url: card.url ?? null,
        type: {category: TmsTaskCategory.Task, detail: null},
        status: this.getStatus(card),
        createdAt: Utils.toDate(this.createActions.get(cardId)?.date) ?? null,
        updatedAt: Utils.toDate(card.dateLastActivity) ?? null,
        statusChangedAt: Utils.toDate(card.dateLastActivity) ?? null,
        statusChangelog: statusChangelog ?? null,
      },
    });

    res.push(...(await this.processBoard(card, taskKey)));
    res.push(...(await this.processAssignment(card, taskKey)));
    res.push(...(await this.processLabels(card, taskKey)));

    return res;
  }

  private async processLabels(
    card: Card,
    taskKey: {uid: string; source: string}
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];

    if ((card?.idLabels ?? []).length > 0) {
      for (const labelId of card.idLabels) {
        const labelName = this.labelNames.get(labelId);
        if (!labelName) {
          continue;
        }
        res.push({
          model: 'tms_TaskTag',
          record: {
            task: taskKey,
            label: {name: labelName},
          },
        });
      }
    }

    return res;
  }

  private async processAssignment(
    card: Card,
    taskKey: {uid: string; source: string}
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];

    if ((card?.idMembers ?? []).length > 0) {
      res.push({
        model: 'tms_TaskAssignment',
        record: {
          task: taskKey,
          assignee: {uid: card.idMembers[0], source: this.source},
        },
      });
    }

    return res;
  }

  private async processBoard(
    card: Card,
    taskKey: {uid: string; source: string}
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];

    if (card?.idBoard) {
      res.push({
        model: 'tms_TaskBoardRelationship',
        record: {
          task: taskKey,
          board: {uid: card.idBoard, source: this.source},
        },
      });
      res.push({
        model: 'tms_TaskProjectRelationship',
        record: {
          task: taskKey,
          project: {uid: card.idBoard, source: this.source},
        },
      });
    }

    return res;
  }

  private async processUpdate(
    cardId: string,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    if (
      !ctx ||
      ctx.streamsSyncMode[this.streamName.asString] ===
        DestinationSyncMode.OVERWRITE ||
      isNil(ctx.farosClient) ||
      isNil(ctx.graph)
    ) {
      return [];
    }

    const card = this.seenCards.get(cardId);
    if (!card) {
      return [];
    }

    const query = `
    {
      tms_Task(
        where: {_and: [{uid: {_eq: "${cardId}"}}, {source: {_eq: "${this.source}"}}]}
      ) {
        statusChangelog
        boards {
          board {
            uid
            source
          }
        }
        assignees {
          assignee {
            uid
            source
          }
        }
        tags {
          label {
            name
          }
        }
      }
    }`;

    const res: DestinationRecord[] = [];

    for await (const task of ctx.farosClient.nodeIterable(
      ctx.graph,
      query,
      100,
      paginatedQueryV2
    )) {
      const taskKey = {uid: task.uid, source: task.source};
      const statusChangelog: TmsTaskStatusChange[] = this.getStatusChangelog(
        task.uid,
        task.statusChangelog
      );
      res.push({
        model: 'tms_Task__Update',
        record: {
          at: Date.now(),
          where: taskKey,
          mask: [
            'name',
            'description',
            'url',
            'type',
            'status',
            'updatedAt',
            'statusChangedAt',
            'statusChangelog',
          ],
          patch: {
            name: card.name,
            description: Utils.cleanAndTruncate(card.desc) ?? null,
            url: card.url ?? null,
            type: {category: TmsTaskCategory.Task, detail: null},
            status: this.getStatus(card),
            updatedAt: Utils.toDate(card.dateLastActivity) ?? null,
            statusChangedAt: Utils.toDate(card.dateLastActivity) ?? null,
            statusChangelog: statusChangelog ?? null,
          },
        },
      });

      for (const board of task.boards || []) {
        if (
          board.board.uid !== card.idBoard &&
          board.board.source === this.source
        ) {
          res.push({
            model: 'tms_TaskBoardRelationship__Deletion',
            record: {
              where: {
                task: taskKey,
                board: board.board,
              },
            },
          });
        }
      }

      res.push(...(await this.processBoard(card, taskKey)));

      const assigneeId = card.idMembers?.[0];
      for (const assignee of task.assignees || []) {
        if (
          assignee.assignee.uid !== assigneeId &&
          assignee.assignee.source === this.source
        ) {
          res.push({
            model: 'tms_TaskAssignment__Deletion',
            record: {
              where: {
                task: taskKey,
                assignee: assignee.assignee,
              },
            },
          });
        }
      }

      res.push(...(await this.processAssignment(card, taskKey)));

      const labels = new Set(card.idLabels);
      for (const tag of task.tags || []) {
        if (!labels.has(tag.label.name)) {
          res.push({
            model: 'tms_TaskTag__Deletion',
            record: {
              where: {
                task: taskKey,
                label: {name: tag.label.name},
              },
            },
          });
        }
      }

      res.push(...(await this.processLabels(card, taskKey)));
    }

    return res;
  }

  private async processDelete(
    cardId: string
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return [
      {
        model: 'tms_Task__Deletion',
        record: {
          where: {
            uid: cardId,
            source: this.source,
          },
        },
      },
    ];
  }

  private getStatus(card: Card): TmsTaskStatus | null {
    if (card.closed) {
      return {category: Tms_TaskStatusCategory.Done, detail: 'completed'};
    } else {
      return {category: Tms_TaskStatusCategory.Todo, detail: 'incomplete'};
    }
  }

  private getStatusChangelog(
    cardId: string,
    initialChangelog: TmsTaskStatusChange[] = []
  ): TmsTaskStatusChange[] {
    const changelog: TmsTaskStatusChange[] = [...initialChangelog];

    for (const action of this.updateActions.get(cardId) ?? []) {
      const changedAt: Date = Utils.toDate(action.date);
      if (action.data?.listAfter) {
        const status: TmsTaskStatus = this.getStatusFromList(
          action.data.listAfter
        );
        changelog.push({status, changedAt});
      } else if (
        _.get(action, 'data.card.closed', false) !==
        _.get(action, 'old.closed', false)
      ) {
        const status: TmsTaskStatus = this.getStatus(action.data.card);
        changelog.push({status, changedAt});
      }
    }

    return _.sortBy(changelog, (item) => -item.changedAt.getTime());
  }

  private getStatusFromList(list: {id?: string; name?: string}): TmsTaskStatus {
    // Try to map using the id first
    // If there is no mapping for the id, try to map using the name
    let result: TmsTaskStatus = Utils.toCategoryDetail(
      Tms_TaskStatusCategory,
      list.id,
      this.config.task_status_category_mapping
    );
    if (result.category !== Tms_TaskStatusCategory.Custom) {
      return result;
    }
    result = Utils.toCategoryDetail(
      Tms_TaskStatusCategory,
      list.name,
      this.config.task_status_category_mapping
    );

    if (result.category === Tms_TaskStatusCategory.Custom) {
      // Since in practice we see so many different list names,
      // we'll try to provide an exhaustive list of TODO and DONE statuses
      // and default to InProgress
      result.category = Tms_TaskStatusCategory.InProgress;
    }

    return result;
  }
}
