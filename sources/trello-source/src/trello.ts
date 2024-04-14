import {AxiosInstance} from 'axios';
import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {makeAxiosInstanceWithRetry} from 'faros-js-client';
import _ from 'lodash';
import {Memoize} from 'typescript-memoize';
import {VError} from 'verror';

import {Action, Board, Card, Label, User} from './models';

export const MIN_DATE = new Date(0).toISOString();
// January 1, 2200
export const MAX_DATE = new Date(7258118400000).toISOString();

const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_API_TIMEOUT_MS = 0; // 0 means no timeout
const DEFAULT_RETRIES = 3;

export interface TrelloConfig {
  credentials: {
    key?: string;
    token?: string;
  };
  boards?: ReadonlyArray<string>;
  cutoff_days?: number;
  page_size?: number;
  api_timeout?: number;
  start_date?: string;
  end_date?: string;
  max_retries?: number;
}

export class Trello {
  private static trello: Trello;

  constructor(
    private readonly httpClient: AxiosInstance,
    private readonly startDate: string,
    private readonly endDate: string,
    private readonly boards: ReadonlyArray<string>,
    private readonly pageSize: number
  ) {}

  static instance(config: TrelloConfig, logger?: AirbyteLogger): Trello {
    if (Trello.trello) return Trello.trello;

    if (!config.credentials?.key) {
      throw new VError('Please provide a Trello API key.');
    }

    if (!config.credentials?.token) {
      throw new VError('Please provide a Trello API token.');
    }

    let startDate: string;
    let endDate: string;

    if (config.start_date || config.end_date) {
      startDate = config.start_date ?? MIN_DATE;
      endDate = config.end_date ?? MAX_DATE;
    } else {
      const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);
      startDate = cutoffDate.toISOString();
      endDate = new Date().toISOString();
    }

    const httpClient = makeAxiosInstanceWithRetry(
      {
        baseURL: `https://api.trello.com/1`,
        timeout: config.api_timeout ?? DEFAULT_API_TIMEOUT_MS,
        maxContentLength: Infinity, //default is 2000 bytes
        // https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/#using-basic-oauth
        headers: {
          Authorization: `OAuth oauth_consumer_key="${config.credentials.key}", oauth_token="${config.credentials.token}"`,
        },
      },
      logger?.asPino(),
      config.max_retries ?? DEFAULT_RETRIES,
      10000
    );

    Trello.trello = new Trello(
      httpClient,
      startDate,
      endDate,
      config.boards ?? [],
      config.page_size ?? DEFAULT_PAGE_SIZE
    );

    return Trello.trello;
  }

  async checkConnection(): Promise<void> {
    let emptyBoards = false;

    try {
      const boards = await this.getBoards();
      emptyBoards = _.isEmpty(boards);
    } catch (err: any) {
      let errorMessage = 'Please verify your credentials. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }

    if (emptyBoards) {
      throw new VError('No boards found.');
    }
  }

  @Memoize()
  async getBoards(): Promise<ReadonlyArray<Board>> {
    const organizationsRes = await this.httpClient.get<any>(
      `members/me/organizations`
    );
    const organizations = organizationsRes.data;

    const boardPromises = organizations.map(async (organization: any) => {
      const boardsRes = await this.httpClient.get<Board>(
        `organizations/${organization.id}/boards`
      );
      return boardsRes.data;
    });

    const boardResponses = await Promise.all(boardPromises);
    const boards = boardResponses.flat();

    if (Array.isArray(boards)) {
      return boards.filter(
        (board) => _.isEmpty(this.boards) || this.boards.includes(board.id)
      );
    }

    return [];
  }

  async *getCards(
    board: string,
    dateLastActivity?: string,
    logger?: AirbyteLogger
  ): AsyncGenerator<Card> {
    const actions = await this.getActions(board, dateLastActivity, logger);
    const seenCards = new Set<string>();

    for await (const action of actions) {
      if (
        action.type === 'deleteCard' ||
        action.type === 'moveCardFromBoard' ||
        action.type === 'moveCardToBoard'
      ) {
        continue;
      }

      const cardId = action.data.card.id;
      if (!seenCards.has(cardId)) {
        seenCards.add(cardId);
        const res = await this.httpClient.get<Card>(`cards/${cardId}`);
        yield res.data;
      }
    }
  }

  @Memoize((board: string, since?: string) => `${board}-${since}`)
  async getActions(
    board: string,
    since?: string,
    logger?: AirbyteLogger
  ): Promise<Action[]> {
    const actionTypes = [
      'createCard',
      'deleteCard',
      'moveCardFromBoard',
      'moveCardToBoard',
      'updateCard',
    ];
    const filter = actionTypes.join(',');
    const start = since ?? this.startDate;
    let end = this.endDate;
    const actions: Action[] = [];

    do {
      const res = await this.httpClient.get<Action[]>(
        `boards/${board}/actions`,
        {
          params: {
            filter,
            since: start,
            before: end,
            limit: this.pageSize,
          },
        }
      );

      if (!Array.isArray(res.data) || res.data.length === 0) {
        logger?.info(
          `No actions found for board ${board} from ${start} to ${end}`
        );
        return actions;
      }

      logger?.info(
        `Fetched ${res.data.length} actions for board ${board} from ${start} to ${end}`
      );

      for (const action of res.data) {
        if (action.date < end) {
          end = action.date;
        }
        actions.push(action);
      }
    } while (end > start);
  }

  async *getUsers(board: string): AsyncGenerator<User> {
    const res = await this.httpClient.get<Board>(`boards/${board}/members`);

    if (Array.isArray(res.data)) {
      for (const member of res.data) {
        yield member;
      }
    }
  }

  async *getLabels(board: string): AsyncGenerator<Label> {
    const res = await this.httpClient.get<Label>(`boards/${board}/labels`);

    if (Array.isArray(res.data)) {
      for (const label of res.data) {
        yield label;
      }
    }
  }
}
