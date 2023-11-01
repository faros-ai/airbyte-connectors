import {FarosClient} from 'faros-js-client';

import {DataIssueWrapper, DataSummaryKey} from './models';

export function simpleHash(str): string {
  let hash = 0;
  if (str.length === 0) return '0';

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return hash.toString();
}

export async function get_paginated_query_results(
  obj_nm: string,
  query: string,
  sort_replace: string,
  fc: FarosClient,
  cfg: any,
  limit: number,
  sort_obj: string = 'id'
): Promise<any[]> {
  // Any query run through this here function has to have "id" in the outermost layer of the response
  // e.g. "obj_nm": {"a": "b", "id": "123"}
  const results = [];
  // upper limit on number of objects in order to avoid running endless while loop
  const max_object_size = 100000;
  let crt_id: string = '';
  // First we run the query on the empty id
  let new_query = query.replace(sort_replace, crt_id);
  let gql_pre_results = await fc.gql(cfg.graph, new_query);
  let gql_results = gql_pre_results[obj_nm];
  const seenIds = new Set<string>();
  while (gql_results.length == limit) {
    results.push(...gql_results);
    if (results.length > max_object_size) {
      throw new Error(
        `Number of results stored so far exceeds the max object size: ${max_object_size}`
      );
    }
    crt_id = gql_results[gql_results.length - 1].get(sort_obj);
    if (!crt_id) {
      return results;
    }
    if (seenIds.has(crt_id)) {
      throw new Error(`The same ID seen twice: ${crt_id}`);
    }
    seenIds.add(crt_id);
    // Now we run the query with the last id
    new_query = query.replace(sort_replace, crt_id);
    gql_pre_results = await fc.gql(cfg.graph, new_query);
    gql_results = gql_pre_results[obj_nm];
  }
  results.push(...gql_results);

  return results;
}

export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

export async function* missingRelationsTest(
  cfg: any,
  fc: FarosClient,
  relationObjects,
  query: string,
  fixed_field: string,
  summaryKey: DataSummaryKey
): AsyncGenerator<DataIssueWrapper> {
  const currentTimestamp: string = getCurrentTimestamp();

  const results = [];
  for (const [main_obj, related_obj] of Object.entries(relationObjects)) {
    const obj_nm = related_obj['obj_nm'];
    let new_query: string = query;
    new_query = new_query.replace('%main_object%', main_obj);
    new_query = new_query.replace('%obj_nm%', obj_nm);
    new_query = new_query.replace('%where_test%', obj_nm);
    const response = await fc.gql(cfg.graph, new_query);
    const result_list = response[main_obj];
    if (!result_list) {
      throw new Error(`Failed to get result for query "${new_query}".`);
    }
    const data_issues: DataIssueWrapper[] =
      get_missing_relation_data_issues_from_result_list(
        result_list,
        main_obj,
        currentTimestamp,
        fixed_field,
        summaryKey
      );
    results.push(...data_issues);
  }
  for (const result of results) {
    yield result;
  }
}

export function get_missing_relation_data_issues_from_result_list(
  res_list: any[],
  main_obj: string,
  crt_timestamp: string,
  fixed_field: string,
  summaryKey: DataSummaryKey
): DataIssueWrapper[] {
  const data_issues: DataIssueWrapper[] = [];
  let recordCount: number = 0;
  for (const rec of res_list) {
    const desc_str = `Missing relation issue: "${main_obj}" missing object or ${fixed_field}.`;
    recordCount += 1;
    data_issues.push({
      faros_DataQualityIssue: {
        uid: `${crt_timestamp}|${main_obj}|${recordCount}`,
        model: main_obj,
        description: desc_str,
        recordIds: [rec.id],
        summary: summaryKey,
      },
    });
  }
  return data_issues;
}
