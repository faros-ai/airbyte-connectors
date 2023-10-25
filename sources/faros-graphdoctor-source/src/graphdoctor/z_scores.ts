import {FarosClient} from 'faros-js-client';

import {
  DataIssueInterface,
  GraphDoctorTestFunction,
  RefreshedAtInterface,
  ZScoreComputationResult,
} from './models';

// Entrypoint
export const runAllZScoreTests: GraphDoctorTestFunction = async function* (
  cfg: any,
  fc: FarosClient
) {
  cfg.logger.info('Starting to compute data recency tests');

  const amount_of_recently_added_to_compute: number = 500;
  const z_score_threshold: number = 2;

  const object_test_list = [
    'ams_Activity',
    'ams_Project',
    'vcs_RepositoryContribution',
    'vcs_Commit',
    'vcs_PullRequest',
    'tms_Task',
    'tms_Project',
    'tms_Epic',
    'qa_TestExecution',
    'cal_Event',
    'cal_Calendar',
    'cal_User',
    'faros_Tag',
    'geo_Location',
    'ims_Incident',
    'ims_IncidentEvent',
    'cicd_Deployment',
    'cicd_Build',
    'cicd_Artifact',
    'cicd_Organization',
    'cicd_Repository',
    'cicd_BuildCommitAssociation',
    'cicd_ArtifactCommitAssociation',
    'compute_Application',
    'compute_Instance',
    'compute_Volume',
  ];
  const base_object_query = `{QUERY_NAME}(order_by: {refreshedAt: desc}, limit: {AMOUNT}, distinct_on: refreshedAt) {
    refreshedAt,
    id
  }`;

  // Note all of the object queries will combined into one
  let query_internal = '';
  for (const obj_nm of object_test_list) {
    const obj_query = substitute_strings_into_queries(
      base_object_query,
      obj_nm,
      amount_of_recently_added_to_compute
    );
    query_internal = `${query_internal} ${obj_query} `;
  }

  cfg.logger.info(`Will run the following query: ${query_internal}`);

  // Keeping the current time stamp to compare
  const now_ts = new Date();
  const secondsSinceEpoch = Math.floor(now_ts.getTime() / 1000);
  const response = await fc.gql(cfg.graph, query_internal);

  const data_issues: DataIssueInterface[] = [];
  let computation_failed: boolean = false;
  for (const obj_nm of object_test_list) {
    const obj_resp: RefreshedAtInterface[] = response[obj_nm];
    const z_score_result: ZScoreComputationResult =
      compute_zscore_for_timestamps(obj_resp, secondsSinceEpoch, obj_nm);
    if (z_score_result.status != 0) {
      computation_failed = true;
    }
    const data_issue: DataIssueInterface | null = convert_result_to_data_issue(
      z_score_result,
      obj_nm,
      z_score_threshold
    );
    if (data_issue) {
      data_issues.push(data_issue);
    }
  }
  if (computation_failed) {
    data_issues.push({uid: `ZScoreComputationFailure_${now_ts}`});
  }
  for (const result of data_issues) {
    yield result;
  }
};

function convert_result_to_data_issue(
  z_score_result: ZScoreComputationResult,
  object_nm: string,
  threshold: number
): DataIssueInterface | null {
  const z_score = z_score_result.z_score;
  if (!z_score) {
    return null;
  }
  if (!(z_score >= threshold)) {
    return null;
  }
  let desc_str: string = `Recency z score passed threshold ${threshold}: ${z_score}. `;
  desc_str += `Last updated time: "${z_score_result.last_updated_time}". `;
  desc_str += `Last time difference in hours: "${z_score_result.last_difference_in_hours}". `;

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
  console.log(`new output query: ${op_str}`);
  return op_str;
}

function find_clusters(data: number[], threshold = null) {
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

function get_stddev_from_list(l: number[]) {
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

function get_avg_per_list(l: number[]) {
  const list_sum = l.reduce((acc, val) => acc + val, 0);
  const average = list_sum / l.length;
  return average;
}

function get_avg_per_cluster(clusters: number[][]) {
  const avgs = clusters.map((x) => get_avg_per_list(x));
  return avgs;
}

export function compute_zscore_for_timestamps(
  responses: RefreshedAtInterface[],
  secondsSinceEpoch: number,
  obj_nm: string
): ZScoreComputationResult {
  // Converting timestamps to seconds since the epoch
  const datetimes = responses.map((x) => new Date(x.refreshedAt));
  const seconds_timestamp = datetimes.map((x) => x.getTime() / 1000);

  const clusters = find_clusters(seconds_timestamp, 10);

  const cluster_averages = get_avg_per_cluster(clusters);

  const cluster_avg_differences: number[] = [];
  for (let i = 1; i < cluster_averages.length; i++) {
    cluster_avg_differences.push(cluster_averages[i - 1] - cluster_averages[i]);
  }
  if (cluster_avg_differences.length < 2) {
    return {status: 1};
  }

  const avg = get_avg_per_list(cluster_avg_differences);
  const std_dev = get_stddev_from_list(cluster_avg_differences);
  if (std_dev === 0) {
    // We can't compute Z Score with STD of 0, which shouldn't occur
    // since nValues > 1, and each value should be a distinct number.
    throw new Error(`Computed standard deviation of 0 for object "${obj_nm}".`);
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
  };
}

function createSlackResult(res, z_score_thresh) {
  let result_str = 'Objects whose Last Updated Time Passes Error Threshold: ';
  let bad_z_score_found = false;
  for (const [obj_nm, value] of Object.entries(res)) {
    if (value['status'] == 0) {
      if (value['z_score'] >= z_score_thresh) {
        bad_z_score_found = true;
        result_str += `|${obj_nm}:${value['z_score']};|    `;
      }
    }
  }
  return {
    threshold_crossed: bad_z_score_found,
    result_str: result_str,
  };
}
