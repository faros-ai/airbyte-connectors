import {FarosClient} from 'faros-js-client';

import {
  DataIssueWrapper,
  DataSummaryKey,
  GraphDoctorTestFunction,
} from './models';
import {get_paginated_query_results, getCurrentTimestamp} from './utils';

function process_name_query_results(
  query_results: any[],
  name_field: string,
  modelName: string,
  crt_timestamp: string,
  summaryKey: DataSummaryKey
): DataIssueWrapper[] {
  const results = [];
  const namesToIDs: Record<string, string> = {};
  let recordCount = 1;
  for (const result_obj of query_results) {
    if (result_obj[name_field] in namesToIDs) {
      results.push({
        faros_DataQualityIssue: {
          uid: `${crt_timestamp}|${modelName}|${recordCount}`,
          title: 'duplicate-names',
          model: modelName,
          description: `Duplicate names for two of the same object: "${modelName}", name: "${result_obj.get(
            name_field
          )}".`,
          recordIds: [namesToIDs[result_obj[name_field]], result_obj.id],
          summary: summaryKey,
        },
      });
      recordCount += 1;
    }
  }
  return results;
}

export const duplicateNames: GraphDoctorTestFunction = async function* (
  cfg: any,
  fc: FarosClient,
  summaryKey: DataSummaryKey
) {
  // For these queries we need to get all the results, so pagination may be necessary
  const test_models = {
    org_Team: {
      name_field: 'name',
    },
    identity_Identity: {
      name_field: 'fullName',
    },
    compute_Application: {
      name_field: 'name',
    },
    tms_Project: {
      name_field: 'name',
    },
    tms_TaskBoard: {
      name_field: 'name',
    },
    vcs_Organization: {
      name_field: 'name',
    },
    vcs_Repository: {
      name_field: 'name',
    },
  };

  const limit = 1000;
  const sort_replace = '%sort_id%';
  const name_replace = '%name_field%';
  const query = `query duplicateNameQuery__%modelName% { %modelName%( limit: ${limit}, order_by: { id: asc } where: { id: { _gt: "${sort_replace}" } } ) { id, ${name_replace} }}`;

  const results = [];
  const crt_timestamp = getCurrentTimestamp();
  for (const [modelName, val] of Object.entries(test_models)) {
    const name_field = val['name_field'];
    // Note each replace only runs once, we want it to run twice
    let new_query = query.replace('%modelName%', modelName);
    new_query = new_query.replace('%modelName%', modelName);
    new_query = new_query.replace(name_replace, name_field);
    cfg.logger.debug('Duplicate Name Query: ' + new_query);
    const query_results = await get_paginated_query_results(
      modelName,
      new_query,
      sort_replace,
      fc,
      cfg,
      limit
    );
    const new_data_issues = process_name_query_results(
      query_results,
      name_field,
      modelName,
      crt_timestamp,
      summaryKey
    );
    results.push(...new_data_issues);
  }

  for (const result of results) {
    yield result;
  }
};
