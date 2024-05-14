import {FarosClient} from 'faros-js-client';

import {
  amountOfRecentlyAddedToCompute,
  computeNumberMinThreshold,
  defaultWithinDays,
  zScoreThreshold,
} from './constants';
import {
  DataIssueWrapper,
  DataSummaryKey,
  GraphDoctorTestFunction,
  RefreshedAtInterface,
  ZScoreComputationResult,
} from './models';

// Entrypoint
export const runAllZScoreTests: GraphDoctorTestFunction = async function* (
  cfg: any,
  fc: FarosClient,
  summaryKey: DataSummaryKey
) {
  cfg.logger.info('Starting to compute data recency tests');

  const object_test_list_groupings = [
    ['ams_Activity', 'ams_Project'],
    ['cal_Event', 'cal_Calendar', 'cal_User'],
    ['cicd_Deployment'],
    ['cicd_Build', 'cicd_BuildCommitAssociation'],
    [
      'cicd_Artifact',
      'cicd_ArtifactCommitAssociation',
      'cicd_ArtifactVulnerability',
    ],
    ['cicd_Organization', 'cicd_Repository'],
    ['compute_Application', 'compute_Instance', 'compute_Volume'],
    ['faros_Tag'],
    ['ims_Incident', 'ims_IncidentEvent'],
    ['qa_TestExecution'],
    ['sec_Vulnerability'],
    ['tms_Task', 'tms_Project', 'tms_Epic'],
    ['vcs_RepositoryContribution', 'vcs_RepositoryVulnerability'],
    ['vcs_Commit'],
    ['vcs_PullRequest'],
  ];
  const base_model_query = `{QUERY_NAME}(order_by: {refreshedAt: desc}, limit: {AMOUNT}, distinct_on: refreshedAt) {
    refreshedAt,
    id
  }`;
  const data_issues: DataIssueWrapper[] = [];
  for (const object_list of object_test_list_groupings) {
    const new_data_issues = await runZScoreTestOnObjectGrouping(
      object_list,
      base_model_query,
      fc,
      cfg,
      summaryKey
    );
    data_issues.push(...new_data_issues);
  }

  for (const result of data_issues) {
    yield result;
  }
};

async function checkForDataRecencyIssue(
  modelName: string,
  base_model_query: string,
  withinDays: number,
  fc: FarosClient,
  cfg: any,
  summaryKey: DataSummaryKey
): Promise<DataIssueWrapper> {
  const obj_query = substitute_strings_into_queries(
    base_model_query,
    modelName,
    1
  );
  const complete_query = normalizeWhitespace(
    `query DataRecencyQuery { ${obj_query} }`
  );
  cfg.logger.info(
    `Will run the following query to check day recency: ${complete_query}`
  );

  // Keeping the current time stamp to compare
  const now_ts = new Date();
  const secondsSinceEpoch = Math.floor(now_ts.getTime() / 1000);
  const response = await fc.gql(cfg.graph, complete_query);
  const obj_resp: RefreshedAtInterface[] = response[modelName];
  if (!obj_resp || obj_resp.length < 1) {
    return null;
  }
  const obj_data: RefreshedAtInterface = obj_resp[0];
  const last_updated_time: Date = new Date(obj_data.refreshedAt);
  const last_updated_time_str: string = last_updated_time.toISOString();
  cfg.logger.info(
    `Last updated time for ${modelName}: ${last_updated_time_str}`
  );
  const last_difference: number =
    secondsSinceEpoch - last_updated_time.getTime() / 1000;
  if (last_difference > 86400 * withinDays) {
    // We round the days difference to 1 decimal place:
    const days_difference = (last_difference / 86400).toFixed(1);
    const desc_str: string = `Recency issue: ${modelName} last updated time greater than ${withinDays} days in the past. Days difference: ${days_difference}. Last datetime: "${last_updated_time}".`;
    return {
      faros_DataQualityIssue: {
        uid: `RecencyIssue_${modelName}_${obj_data.refreshedAt}`,
        title: 'daily-recency',
        model: modelName,
        description: desc_str,
        recordIds: [obj_data.id],
        summary: summaryKey,
      },
    };
  }
}

async function runZScoreTestOnObjectGrouping(
  object_test_list: string[],
  base_model_query: string,
  fc: FarosClient,
  cfg: any,
  summaryKey: DataSummaryKey
): Promise<DataIssueWrapper[]> {
  const data_issues: DataIssueWrapper[] = [];
  // Note all of the objects in the object_test_list queries will combined into one
  let query_internal = '';
  for (const modelName of object_test_list) {
    const obj_query = substitute_strings_into_queries(
      base_model_query,
      modelName,
      amountOfRecentlyAddedToCompute
    );
    query_internal = `${query_internal} ${obj_query} `;
  }
  const complete_query = normalizeWhitespace(
    `query ZScoreQuery { ${query_internal} }`
  );
  cfg.logger.info(`Will run the following query: ${complete_query}`);

  // Keeping the current time stamp to compare
  const now_ts = new Date();
  const secondsSinceEpoch = Math.floor(now_ts.getTime() / 1000);
  const response = await fc.gql(cfg.graph, complete_query);

  for (const modelName of object_test_list) {
    const obj_resp: RefreshedAtInterface[] = response[modelName];
    if (!obj_resp || obj_resp.length < computeNumberMinThreshold) {
      continue;
    }
    const z_score_result: ZScoreComputationResult =
      compute_zscore_for_timestamps(
        obj_resp,
        secondsSinceEpoch,
        modelName,
        cfg
      );
    if (z_score_result.status != 0) {
      const failure_msg: string = `Non-zero z-score status: "${z_score_result.status}" for ${modelName}. Message: "${z_score_result.msg}"`;
      data_issues.push({
        faros_DataQualityIssue: {
          uid: `ZScoreComputationFailure: ${now_ts}`,
          description: failure_msg,
          model: modelName,
          summary: summaryKey,
        },
      });
      continue;
    }
    const data_issue: DataIssueWrapper | null = convert_result_to_data_issue(
      z_score_result,
      modelName,
      zScoreThreshold,
      cfg,
      summaryKey
    );
    if (data_issue) {
      data_issues.push(data_issue);
    }
  }
  return data_issues;
}

function convert_result_to_data_issue(
  z_score_result: ZScoreComputationResult,
  modelName: string,
  threshold: number,
  cfg: any,
  summaryKey: DataSummaryKey
): DataIssueWrapper | null {
  const z_score = z_score_result.z_score;
  if (!z_score) {
    return null;
  }
  if (z_score < threshold) {
    cfg.logger.info(
      `Got z-score of ${z_score} out of ${z_score_result.nResults} results for object ${modelName}.`
    );
    return null;
  }
  let desc_str: string = `Recency z score passed threshold ${threshold}: ${z_score}. `;
  desc_str += `Last updated time: "${z_score_result.last_updated_time}". `;
  desc_str += `Last time difference in hours: "${z_score_result.last_difference_in_hours}". `;
  desc_str += `Number of datetime stamps: ${z_score_result.nResults}.`;

  return {
    faros_DataQualityIssue: {
      uid: `Z_Score_Issue_${modelName}_${z_score_result.last_updated_time}`,
      title: 'z-score',
      model: modelName,
      description: desc_str,
      recordIds: [z_score_result.last_id],
      summary: summaryKey,
    },
  };
}

function substitute_strings_into_queries(
  query_str: string,
  modelName: string,
  amt: number
): string {
  let op_str = query_str.replace('{QUERY_NAME}', modelName);
  op_str = op_str.replace('{AMOUNT}', amt.toString());
  return op_str;
}

function find_clusters(data: number[], threshold = null): number[][] {
  if (data.length === 0) {
    return null;
  }
  // Calculate the differences between consecutive data points
  const differences = data
    .slice(0, data.length - 1)
    .map((val, idx) => val - data[idx + 1]);

  // If threshold is not provided, set it to the average difference
  if (threshold === null && differences.length > 0) {
    threshold =
      differences.reduce((acc, val) => acc + val) / differences.length;
  }
  const clusters = [];
  let current_cluster = [data[0]];

  // Iterate over the data points and their differences
  differences.forEach((diff, idx) => {
    if (diff > threshold) {
      // If difference is greater than threshold, it indicates the start of a new cluster
      clusters.push(current_cluster);
      current_cluster = [];
    }
    current_cluster.push(data[idx + 1]);
  });

  // Add the last cluster
  clusters.push(current_cluster);

  return clusters;
}

function get_stddev_from_list(l: number[]): number {
  // Step 1: Calculate the mean
  const mean = get_avg_per_list(l);

  // Step 2: Subtract the mean and square the result
  const squaredDeviations = l.map((val) => (val - mean) ** 2);

  // Step 3: Calculate the mean of the squared deviations
  const meanSquaredDeviations =
    squaredDeviations.reduce((acc, val) => acc + val, 0) /
    squaredDeviations.length;

  // Step 4: Take the square root of the mean squared deviation
  const standardDeviation = Math.sqrt(meanSquaredDeviations);

  return standardDeviation;
}

function get_avg_per_list(l: number[]): number {
  const list_sum = l.reduce((acc, val) => acc + val, 0);
  const average = list_sum / l.length;
  return average;
}

function get_avg_per_cluster(clusters: number[][]): number[] {
  const avgs = clusters.map((x) => get_avg_per_list(x));
  return avgs;
}

export function compute_zscore_for_timestamps(
  responses: RefreshedAtInterface[],
  secondsSinceEpoch: number,
  modelName: string,
  cfg: any
): ZScoreComputationResult {
  const nResults: number = responses.length;
  // Converting timestamps to seconds since the epoch
  const datetimes = responses.map((x) => new Date(x.refreshedAt));
  const seconds_timestamp = datetimes.map((x) => x.getTime() / 1000);

  const clusters: number[][] = find_clusters(seconds_timestamp, 10);

  if (!clusters) {
    cfg.logger.debug(JSON.stringify(datetimes));
    cfg.logger.debug(JSON.stringify(seconds_timestamp));
    return {status: 1, msg: `No clusters, nResults: "${nResults}".`};
  }

  const cluster_averages: number[] = get_avg_per_cluster(clusters);

  const cluster_avg_differences: number[] = [];
  for (let i = 1; i < cluster_averages.length; i++) {
    cluster_avg_differences.push(cluster_averages[i - 1] - cluster_averages[i]);
  }
  if (cluster_avg_differences.length < computeNumberMinThreshold) {
    let msg_str: string = `Number of cluster average differences less than compute number min threshold: ${cluster_avg_differences.length} < ${computeNumberMinThreshold}. `;
    msg_str += ` nResults: "${nResults}"`;
    return {
      status: 1,
      msg: msg_str,
    };
  }

  const avg = get_avg_per_list(cluster_avg_differences);
  const std_dev = get_stddev_from_list(cluster_avg_differences);
  if (std_dev === 0) {
    // We can't compute Z Score with STD of 0, which shouldn't occur
    // since nValues > 1, and each value should be a distinct number.
    return {
      status: 1,
      msg: `Computed standard deviation of 0, nResults: "${nResults}".`,
    };
  }

  // Difference between times in seconds
  const last_difference: number = secondsSinceEpoch - seconds_timestamp[0];
  const last_id: string = responses[0].id;
  const last_updated_time: Date = responses[0].refreshedAt;
  const z_score = (last_difference - avg) / std_dev;
  return {
    status: 0,
    avg: avg,
    std_dev: std_dev,
    z_score: z_score,
    last_difference_in_hours: last_difference / 3600,
    last_id: last_id,
    last_updated_time: last_updated_time,
    nResults: nResults,
  };
}

function normalizeWhitespace(str): string {
  return str.replace(/\s+/g, ' ');
}

export const checkIfWithinLastXDays: GraphDoctorTestFunction = async function* (
  cfg: any,
  fc: FarosClient,
  summaryKey: DataSummaryKey
) {
  const days = cfg.day_delay_threshold
    ? cfg.day_delay_threshold
    : defaultWithinDays;
  const model_test_list = [
    'cicd_Deployment',
    'cicd_Build',
    'cicd_Artifact',
    'vcs_Commit',
    'vcs_PullRequest',
    'tms_Task',
  ];
  cfg.logger.debug(
    `Starting to compute if objects appeared within the last ${days} days for models: ${model_test_list}`
  );

  const base_model_query = `{QUERY_NAME}(order_by: {refreshedAt: desc}, limit: {AMOUNT}, distinct_on: refreshedAt) {
    refreshedAt,
    id
  }`;
  const data_issues: DataIssueWrapper[] = [];

  for (const modelName of model_test_list) {
    const new_data_issue = await checkForDataRecencyIssue(
      modelName,
      base_model_query,
      days,
      fc,
      cfg,
      summaryKey
    );
    if (new_data_issue) {
      data_issues.push(new_data_issue);
    }
  }

  for (const result of data_issues) {
    yield result;
  }
};
