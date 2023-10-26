import {FarosClient} from 'faros-js-client';

import {
  DataIssueInterface,
  GraphDoctorTestFunction,
  RefreshedAtInterface,
  ZScoreComputationResult,
} from './models';

const compute_number_min_threshold: number = 10;
const amount_of_recently_added_to_compute: number = 500;
const z_score_threshold: number = 2;

// Entrypoint
export const runAllZScoreTests: GraphDoctorTestFunction = async function* (
  cfg: any,
  fc: FarosClient
) {
  cfg.logger.info('Starting to compute data recency tests');

  const object_test_list_groupings = [
    ['ams_Activity', 'ams_Project'],
    ['cal_Event', 'cal_Calendar', 'cal_User'],
    [
      'cicd_Deployment',
      'cicd_Build',
      'cicd_Artifact',
      'cicd_Organization',
      'cicd_Repository',
      'cicd_BuildCommitAssociation',
      'cicd_ArtifactCommitAssociation',
    ],
    ['compute_Application', 'compute_Instance', 'compute_Volume'],
    ['faros_Tag', 'geo_Location'],
    ['ims_Incident', 'ims_IncidentEvent'],
    ['qa_TestExecution'],
    ['tms_Task', 'tms_Project', 'tms_Epic'],
    ['vcs_RepositoryContribution', 'vcs_Commit', 'vcs_PullRequest'],
  ];
  const base_object_query = `{QUERY_NAME}(order_by: {refreshedAt: desc}, limit: {AMOUNT}, distinct_on: refreshedAt) {
    refreshedAt,
    id
  }`;
  const data_issues: DataIssueInterface[] = [];
  for (const object_list of object_test_list_groupings) {
    const new_data_issues = await runZScoreTestOnObjectGrouping(
      object_list,
      base_object_query,
      fc,
      cfg
    );
    data_issues.push(...new_data_issues);
  }

  // For testing:
  console.log(data_issues);
  for (const result of data_issues) {
    yield result;
  }
};

async function runZScoreTestOnObjectGrouping(
  object_test_list: string[],
  base_object_query: string,
  fc: FarosClient,
  cfg: any
): Promise<DataIssueInterface[]> {
  const data_issues: DataIssueInterface[] = [];
  // Note all of the objects in the object_test_list queries will combined into one
  let query_internal = '';
  for (const obj_nm of object_test_list) {
    const obj_query = substitute_strings_into_queries(
      base_object_query,
      obj_nm,
      amount_of_recently_added_to_compute
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

  let failure_msg: string;
  for (const obj_nm of object_test_list) {
    failure_msg = '';
    const obj_resp: RefreshedAtInterface[] = response[obj_nm];
    if (!obj_resp || obj_resp.length < compute_number_min_threshold) {
      continue;
    }
    const z_score_result: ZScoreComputationResult =
      compute_zscore_for_timestamps(obj_resp, secondsSinceEpoch, obj_nm, cfg);
    if (z_score_result.status != 0) {
      failure_msg += `Non-zero z-score status: "${z_score_result.status}" for ${obj_nm}. `;
      data_issues.push({
        uid: `ZScoreComputationFailure: ${now_ts}`,
        description: failure_msg,
      });
      continue;
    }
    const data_issue: DataIssueInterface | null = convert_result_to_data_issue(
      z_score_result,
      obj_nm,
      z_score_threshold,
      cfg
    );
    if (data_issue) {
      data_issues.push(data_issue);
    }
  }
  return data_issues;
}

function convert_result_to_data_issue(
  z_score_result: ZScoreComputationResult,
  object_nm: string,
  threshold: number,
  cfg: any
): DataIssueInterface | null {
  const z_score = z_score_result.z_score;
  if (!z_score) {
    return null;
  }
  if (z_score < threshold) {
    cfg.logger.info(
      `Got z-score of ${z_score} out of ${z_score_result.nResults} results for object ${object_nm}.`
    );
    return null;
  }
  let desc_str: string = `Recency z score passed threshold ${threshold}: ${z_score}. `;
  desc_str += `Last updated time: "${z_score_result.last_updated_time}". `;
  desc_str += `Last time difference in hours: "${z_score_result.last_difference_in_hours}". `;
  desc_str += `Number of datetime stamps: ${z_score_result.nResults}.`;

  return {
    uid: `Z_Score_Issue_${object_nm}_${z_score_result.last_updated_time}`,
    description: desc_str,
    recordIds: [z_score_result.last_id],
  };
}

function substitute_strings_into_queries(
  query_str: string,
  obj_nm: string,
  amt: number
): string {
  let op_str = query_str.replace('{QUERY_NAME}', obj_nm);
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
  obj_nm: string,
  cfg: any
): ZScoreComputationResult {
  const nResults: number = responses.length;
  // Converting timestamps to seconds since the epoch
  const datetimes = responses.map((x) => new Date(x.refreshedAt));
  const seconds_timestamp = datetimes.map((x) => x.getTime() / 1000);

  const clusters: number[][] = find_clusters(seconds_timestamp, 10);

  if (!clusters) {
    cfg.logger.info(JSON.stringify(datetimes));
    cfg.logger.info(JSON.stringify(seconds_timestamp));
    return {status: 1, msg: 'No clusters.'};
  }

  const cluster_averages: number[] = get_avg_per_cluster(clusters);

  const cluster_avg_differences: number[] = [];
  for (let i = 1; i < cluster_averages.length; i++) {
    cluster_avg_differences.push(cluster_averages[i - 1] - cluster_averages[i]);
  }
  if (cluster_avg_differences.length < compute_number_min_threshold) {
    return {
      status: 1,
      msg: `Number of cluster average differences less than compute number min threshold: ${cluster_avg_differences.length}`,
    };
  }

  const avg = get_avg_per_list(cluster_avg_differences);
  const std_dev = get_stddev_from_list(cluster_avg_differences);
  if (std_dev === 0) {
    // We can't compute Z Score with STD of 0, which shouldn't occur
    // since nValues > 1, and each value should be a distinct number.
    return {
      status: 1,
      msg: `Computed standard deviation of 0.`,
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
