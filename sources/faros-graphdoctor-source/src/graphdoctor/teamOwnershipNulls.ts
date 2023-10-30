import {FarosClient} from 'faros-js-client';
import _ from 'lodash';

import {DataIssueWrapper, GraphDoctorTestFunction} from './models';

export const teamOwnershipNulls: GraphDoctorTestFunction = async function* (
  cfg: any,
  fc: FarosClient
) {
  // team Ownership objects:
  const ownershipObjects = {
    org_ApplicationOwnership: {
      obj_nm: 'application',
    },
    org_BoardOwnership: {
      obj_nm: 'board',
    },
    org_PipelineOwnership: {
      obj_nm: 'pipeline',
    },
    org_RepositoryOwnership: {
      obj_nm: 'repository',
    },
  };
  const query =
    'query MyQuery { %main_object%(where: { _not: {%where_test%: {}}, _or: {_not: {team: {}} } }) { team {id} %obj_nm% {id} id } }';

  const currentTimestamp: string = new Date().toISOString();

  const results = [];
  for (const [main_obj, related_obj] of Object.entries(ownershipObjects)) {
    const obj_nm = related_obj['obj_nm'];
    const new_query: string = query;
    new_query.replace('%main_object%', main_obj);
    new_query.replace('%obj_nm%', obj_nm);
    new_query.replace('%where_test%', obj_nm);
    const response = await fc.gql(cfg.graph, query);
    const result_list = response[main_obj];
    const data_issues: DataIssueWrapper[] = get_data_issues_from_result_list(
      result_list,
      main_obj,
      currentTimestamp
    );
    results.push(...data_issues);
  }
  for (const result of results) {
    yield result;
  }
};

function get_data_issues_from_result_list(
  res_list: any[],
  main_obj: string,
  crt_timestamp: string
): DataIssueWrapper[] {
  const data_issues: DataIssueWrapper[] = [];
  let recordCount: number = 0;
  for (const rec of res_list) {
    const desc_str = `Missing object or team in ownership object "${main_obj}"`;
    recordCount += 1;
    data_issues.push({
      faros_DataQualityIssue: {
        uid: `${crt_timestamp}:${main_obj}:${recordCount}`,
        model: main_obj,
        description: desc_str,
        recordIds: [rec.id],
      },
    });
  }
  return data_issues;
}
