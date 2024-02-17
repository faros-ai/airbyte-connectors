import {AirbyteRecord, DestinationSyncMode} from 'faros-airbyte-cdk';
import {paginatedQueryV2,Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {
  DestinationModel,
  DestinationRecord,
  StreamContext,
  StreamName,
} from '../converter';
import {TrelloConverter} from './common';
import {Action, Card} from './models';

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

export class Cards extends TrelloConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_TaskProjectRelationship',
    'tms_TaskBoardRelationship',
    'tms_TaskDependency',
    'tms_TaskAssignment',
    'tms_TaskTag',
  ];

  static readonly actionsStream = new StreamName('trello', 'actions');

  override get dependencies(): ReadonlyArray<StreamName> {
    return [Cards.actionsStream];
  }

  private seenCards: Map<string, Card> = new Map();
  private createActions: Map<string, Action> = new Map();
  private updateActions: Map<string, Array<Action>> = new Map();
  private createdCards: Set<string> = new Set();
  private updatedCards: Set<string> = new Set();
  private deletedCards: Set<string> = new Set();

  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
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
    const statusChangelog: TmsTaskStatusChange[] = [];

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

    const query = `
    {
      tms_Task(
        where: {_and: [{uid: {_eq: "${cardId}"}}, {source: {_eq: "${this.source}"}}]}
      ) {
        statusChangelog
      }
    }`;

    for await (const task of ctx.farosClient.nodeIterable(
      ctx.graph,
      query,
      100,
      paginatedQueryV2
    )) {
      // Update all the fields from the card
      // Merge the statusChangelog from the graph with the new statusChangelog
      // Update the relationships if necessary (board, project, assignee)
      // Verify whether the card board changes right away after moving the card to another board (trello source)
    }

    return [];
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
}
