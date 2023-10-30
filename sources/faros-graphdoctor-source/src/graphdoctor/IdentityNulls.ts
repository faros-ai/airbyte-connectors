import {FarosClient} from 'faros-js-client';

import {DataIssueWrapper, GraphDoctorTestFunction} from './models';
import {get_missing_relation_data_issues_from_result_list} from './utils';

export const identityNulls: GraphDoctorTestFunction = async function* (
  cfg: any,
  fc: FarosClient
) {
  // team Ownership objects:
  const identityObjects = {
    vcs_UserIdentity: {
      obj_nm: 'vcsUser',
    },
    ims_UserIdentity: {
      obj_nm: 'imsUser',
    },
    tms_UserIdentity: {
      obj_nm: 'tmsUser',
    },
  };
  const query =
    'query MyQuery { %main_object%(where: { _or: [ {_not: {%where_test%: {}}}, {_not: {identity: {}} }] }) { identity {id} %obj_nm% {id} id } }';

  const currentTimestamp: string = new Date().toISOString();

  const results = [];
  for (const [main_obj, related_obj] of Object.entries(identityObjects)) {
    const obj_nm = related_obj['obj_nm'];
    const new_query: string = query;
    new_query.replace('%main_object%', main_obj);
    new_query.replace('%obj_nm%', obj_nm);
    new_query.replace('%where_test%', obj_nm);
    const response = await fc.gql(cfg.graph, query);
    const result_list = response[main_obj];
    const data_issues: DataIssueWrapper[] =
      get_missing_relation_data_issues_from_result_list(
        result_list,
        main_obj,
        currentTimestamp,
        'identity'
      );
    results.push(...data_issues);
  }
  for (const result of results) {
    yield result;
  }
};
