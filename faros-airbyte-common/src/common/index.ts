import {createHmac} from 'crypto';
import {FarosClient, paginatedQueryV2} from 'faros-js-client';
import fs from 'fs';
import {toLower} from 'lodash';
import {DateTime} from 'luxon';
import path from 'path';
import {VError} from 'verror';

// TODO: Try https://www.npmjs.com/package/diff
export interface FileDiff {
  deletions: number;
  additions: number;
  from?: string;
  to?: string;
  deleted?: boolean;
  new?: boolean;
}

export function bucket(key: string, data: string, bucketTotal: number): number {
  const md5 = createHmac('md5', key);
  md5.update(data);
  const hex = md5.digest('hex').substring(0, 8);
  return (parseInt(hex, 16) % bucketTotal) + 1; // 1-index for readability
}

export function validateBucketingConfig(
  bucketId: number = 1,
  bucketTotal: number = 1
): void {
  if (bucketTotal < 1) {
    throw new VError('bucket_total must be a positive integer');
  }
  if (bucketId < 1 || bucketId > bucketTotal) {
    throw new VError(`bucket_id must be between 1 and ${bucketTotal}`);
  }
}

export function nextBucketId(
  config: {bucket_total?: number},
  state?: {__bucket_execution_state?: {last_executed_bucket_id?: number}}
): number {
  const bucketTotal = config.bucket_total ?? 1;
  const lastExecutedBucketId =
    state?.__bucket_execution_state?.last_executed_bucket_id ?? bucketTotal;

  return (lastExecutedBucketId % bucketTotal) + 1;
}

export function calculateDateRange(options: {
  start_date?: string;
  end_date?: string;
  cutoff_days?: number;
  logger: (message: string) => void;
}) {
  const {start_date, end_date, cutoff_days, logger} = options;

  let startDate: Date;
  let endDate: Date;

  if (!end_date) {
    logger('End date not provided, using current date');
    endDate = new Date();
  } else {
    endDate = new Date(end_date);
  }

  if (start_date && cutoff_days) {
    logger('Both start date and cutoff days provided, discarding cutoff days');
  }

  if (start_date) {
    startDate = new Date(start_date);
  } else {
    if (cutoff_days) {
      logger('Cutoff days provided, calculating start date from end date');
      startDate = DateTime.fromJSDate(endDate)
        .minus({days: cutoff_days})
        .toJSDate();
    } else {
      throw new Error('Either start_date or cutoff_days must be provided');
    }
  }

  if (startDate > endDate) {
    throw new Error(`Start date: ${startDate} is after end date: ${endDate}`);
  }

  logger(`Will process data from ${startDate} to ${endDate}`);

  return {startDate, endDate};
}

export function collectReposByOrg(
  reposByOrg: Map<string, Set<string>>,
  repos: ReadonlyArray<string>
): void {
  for (const repo of repos) {
    const [org, name] = repo.split('/');
    if (!org || !name) {
      throw new VError(
        `Bad repository provided: ${repo}. Must match org/repo format, e.g apache/kafka`
      );
    }
    const lowerOrg = toLower(org);
    const lowerRepoName = toLower(name);
    if (!reposByOrg.has(lowerOrg)) {
      reposByOrg.set(lowerOrg, new Set());
    }
    reposByOrg.get(lowerOrg).add(lowerRepoName);
  }
}

const readFarosOptionsQuery = (fileName: string) =>
  fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'resources',
      'common',
      'queries',
      fileName
    ),
    'utf8'
  );

const TMS_TASK_BOARD_OPTIONS_QUERY = readFarosOptionsQuery(
  'faros-tms-task-board-options.gql'
);

const VCS_REPOSITORY_OPTIONS_QUERY = readFarosOptionsQuery(
  'faros-vcs-repository-options.gql'
);

export async function getFarosOptions(
  optionsType: 'board' | 'repository',
  source: string,
  farosClient: FarosClient,
  graph: string
): Promise<{
  included: Set<string>;
  excluded: Set<string>;
}> {
  const included = new Set<string>();
  const excluded = new Set<string>();
  let query: string;
  switch (optionsType) {
    case 'board':
      query = TMS_TASK_BOARD_OPTIONS_QUERY;
      break;
    case 'repository':
      query = VCS_REPOSITORY_OPTIONS_QUERY;
      break;
    default:
      throw new Error(`Unknown Faros options type: ${optionsType}`);
  }
  const iter = farosClient.nodeIterable(
    graph,
    query,
    1000,
    paginatedQueryV2,
    new Map(
      Object.entries({
        source,
      })
    )
  );
  for await (const options of iter) {
    const key = getFarosOptionsItemKey(optionsType, options);
    if (!key) continue;
    if (options.inclusionCategory === 'Included') {
      included.add(key);
    } else if (options.inclusionCategory === 'Excluded') {
      excluded.add(key);
    }
  }
  return {included, excluded};
}

const getFarosOptionsItemKey = (
  optionsType: 'board' | 'repository',
  options: any
): string => {
  switch (optionsType) {
    case 'board': {
      const board = options.board?.uid;
      if (!board) {
        return;
      }
      return board;
    }
    case 'repository': {
      const repo = options.repository?.name;
      const org = options.repository?.organization?.uid;
      if (!repo || !org) {
        return;
      }
      return `${org}/${repo}`;
    }
  }
};
