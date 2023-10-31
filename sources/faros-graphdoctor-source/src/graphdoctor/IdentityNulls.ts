import {FarosClient} from 'faros-js-client';

import {DataIssueWrapper, GraphDoctorTestFunction} from './models';
import {
  get_missing_relation_data_issues_from_result_list,
  missingRelationsTest,
} from './utils';

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

  yield* missingRelationsTest(cfg, fc, identityObjects, query, 'identity');
};
