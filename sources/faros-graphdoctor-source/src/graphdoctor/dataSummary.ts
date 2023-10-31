// Within this file we intend to summarize phantoms vs nonPhantom data

import {FarosClient} from 'faros-js-client';
import {sum} from 'lodash';

import {
  DataSummaryKey,
  DataSummaryWrapper,
  FarosDataQualityRecordCount,
} from './models';

async function getDataQualityRecordCount(
  fc: FarosClient,
  cfg: any,
  modelName: string
): Promise<FarosDataQualityRecordCount> {
  // e.g. tms_Task_aggregate
  const aggregate_name = `${modelName}_aggregate`;
  const base_query = `query MyQuery { ${aggregate_name}(where: {isPhantom: {_eq: %bool%}}) { aggregate { count } } }`;
  const phantomCounter: Record<string, number> = {};
  for (const bool_val of ['true', 'false']) {
    const new_query = base_query.replace('%bool%', bool_val);
    const result = await fc.gql(cfg.graph, new_query, {phantoms: 'include'});
    let count = result?.[aggregate_name]?.aggregate?.count;
    count = count ? count : 0;
    phantomCounter[bool_val] = count;
  }
  const recordCount = {
    model: modelName,
    total: sum(Object.values(phantomCounter)),
    phantoms: phantomCounter.true,
    nonPhantoms: phantomCounter.false,
  };
  return recordCount;
}

export async function getDataQualitySummary(
  fc: FarosClient,
  cfg: any,
  summaryKey: DataSummaryKey,
  start_timestamp: string
): Promise<DataSummaryWrapper> {
  const modelsOfInterest = [
    'ams_Project',
    'ams_Activity',
    'cal_Event',
    'cicd_Pipeline',
    'cicd_Build',
    'cicd_Repository',
    'cicd_Artifact',
    'cicd_Deployment',
    'faros_Tag',
    'ims_Incident',
    'qa_TestCase',
    'qa_TestExecution',
    'survey_Survey',
    'tms_Task',
    'tms_Project',
    'vcs_PullRequest',
    'vcs_Commit',
  ];
  const dataQualityRecordCounts: FarosDataQualityRecordCount[] = [];
  for (const modelName of modelsOfInterest) {
    dataQualityRecordCounts.push(
      await getDataQualityRecordCount(fc, cfg, modelName)
    );
  }

  // Convert to Date objects
  const start = new Date(start_timestamp);
  const end = new Date();
  // Get difference in milliseconds
  const elapsedMs = end.getTime() - start.getTime();
  const dataQualitySummary: DataSummaryWrapper = {
    faros_DataQualitySummary: {
      uid: summaryKey.uid,
      source: summaryKey.source,
      createdAt: end,
      elapsedMs,
      counts: dataQualityRecordCounts,
    },
  };
  return dataQualitySummary;
}
