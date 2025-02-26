import {AirbyteLogger} from 'faros-airbyte-cdk';
import {Status} from 'faros-airbyte-common/jira';

import {Jira, JiraConfig} from '../../src/jira';

export function setupJiraInstance(
  mockedImplementation: any,
  isCloud: boolean,
  sourceConfig: JiraConfig,
  logger: AirbyteLogger
): void {
  const statusByName = new Map<string, Status>();
  statusByName.set('backlog', {category: 'To Do', detail: 'Backlog'});
  statusByName.set('inprogress', {
    category: 'In Progress',
    detail: 'In Progress',
  });

  const statusById = new Map<string, Status>();
  statusById.set('10001', {category: 'To Do', detail: 'Backlog'});
  statusById.set('10002', {category: 'Done', detail: 'Done'});
  statusById.set('10004', {
    category: 'In Progress',
    detail: 'In Progress',
  });
  Jira.instance = jest.fn().mockImplementation(() => {
    return new Jira(
      'https://jira.com',
      mockedImplementation ?? ({} as any),
      {} as any,
      new Map([
        ['field_001', 'Development'],
        ['customfield_10000', 'Custom Number Field'],
        ['customfield_10001', 'Custom String Field'],
        ['customfield_10002', 'Epic Link'],
        ['customfield_10003', 'Story Points'],
        ['customfield_10004', 'Story point estimate'],
        ['customfield_10005', 'Custom Array Field'],
        ['customfield_10020', 'Sprint'],
      ]),
      50,
      statusByName,
      statusById,
      isCloud,
      5,
      100,
      sourceConfig.bucket_id,
      sourceConfig.bucket_total,
      logger,
      undefined,
      sourceConfig?.requestedStreams,
      sourceConfig?.use_sprints_reverse_search
    );
  });
}

export function paginate<V>(
  items: V[],
  itemsField = 'values',
  pageSize = 1,
  mockOnePage = false
): jest.Mock {
  const fn = jest.fn();
  if (mockOnePage) {
    fn.mockResolvedValue({
      isLast: true,
      [itemsField]: items,
    });
    return fn;
  }
  let count = 0;
  do {
    const slice = items.slice(count, count + pageSize);
    count += slice.length;
    fn.mockResolvedValueOnce({
      isLast: count === items.length,
      [itemsField]: slice,
    });
  } while (count < items.length);
  return fn;
}

export async function* iterate<T>(
  arrOrErr: ReadonlyArray<T> | Error
): AsyncIterableIterator<T> {
  if (arrOrErr instanceof Error) {
    throw arrOrErr;
  }
  for (const x of arrOrErr) {
    yield x;
  }
}

export function mockFarosOptions({
  includedUids = [],
  excludedUids = [],
}: {
  includedUids?: string[];
  excludedUids?: string[];
} = {}): any {
  return {
    nodeIterable: () =>
      iterate([
        ...includedUids.map((uid) => taskBoardOptions(uid, 'Included')),
        ...excludedUids.map((uid) => taskBoardOptions(uid, 'Excluded')),
      ]),
  };
}

function taskBoardOptions(
  uid: string,
  inclusionCategory: 'Included' | 'Excluded'
) {
  return {
    board: {
      uid,
    },
    inclusionCategory,
  };
}
