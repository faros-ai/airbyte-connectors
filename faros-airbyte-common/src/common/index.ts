import {createHmac} from 'crypto';
import {DateTime} from 'luxon';
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
