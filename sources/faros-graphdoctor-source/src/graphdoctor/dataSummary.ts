// Within this file we intend to summarize phantoms vs nonPhantom data

import {FarosClient} from 'faros-js-client';
import {Phantom} from 'faros-js-client/lib/types';
import _ from 'lodash';

import {
  DataSummaryInterface,
  DataSummaryKey,
  DataSummaryWrapper,
  FarosDataQualityRecordCount,
} from './models';

async function getDataQualityRecordCount(
  fc: FarosClient,
  phantomFC: FarosClient,
  cfg: any,
  modelName: string,
  prev_DSI: DataSummaryInterface | null
): Promise<FarosDataQualityRecordCount> {
  // e.g. tms_Task_aggregate
  const aggregate_name = `${modelName}_aggregate`;
  const base_query = `query RecordCount__${aggregate_name} { ${aggregate_name}(where: {isPhantom: {_eq: %bool%}}) { aggregate { count } } }`;
  const phantomCounter: Record<string, number> = {};
  for (const bool_val of ['true', 'false']) {
    const new_query: string = base_query.replace('%bool%', bool_val);
    let result: any;
    if (bool_val === 'false') {
      result = await fc.gql(cfg.graph, new_query);
    } else {
      result = await phantomFC.gql(cfg.graph, new_query);
    }
    const count = result?.[aggregate_name]?.aggregate?.count;
    if (!_.isNumber(count)) {
      throw new Error(
        `Could not compute count for query ${new_query}. Res: "${JSON.stringify(
          result
        )}"`
      );
    }
    phantomCounter[bool_val] = count;
  }
  const total_records: number = _.sum(Object.values(phantomCounter));
  const percentageChange: number = prev_DSI
    ? (total_records - prev_DSI.counts[modelName]) / prev_DSI.counts[modelName]
    : null;
  const recordCount = {
    model: modelName,
    total: _.sum(Object.values(phantomCounter)),
    phantoms: phantomCounter.true,
    nonPhantoms: phantomCounter.false,
    percentageChange,
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
  const phantomFarosClient = new FarosClient({
    url: cfg.api_url,
    apiKey: cfg.api_key,
    phantoms: Phantom.Include,
    useGraphQLV2: true,
  });

  const previousDataQualitySummary: DataSummaryInterface | null =
    await getPreviousDataQualitySummary(fc, cfg);
  cfg.logger.info(
    `Previous Data Quality Summary: ${JSON.stringify(
      previousDataQualitySummary
    )}`
  );
  for (const modelName of modelsOfInterest) {
    dataQualityRecordCounts.push(
      await getDataQualityRecordCount(
        fc,
        phantomFarosClient,
        cfg,
        modelName,
        previousDataQualitySummary
      )
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

function checkIfCreatedWithinLastXHours(
  createdAt: string,
  hours: number
): boolean {
  if (!createdAt) {
    return false;
  }
  const created = new Date(createdAt);
  const now = new Date();
  const elapsedMs = now.getTime() - created.getTime();
  const elapsedHours = elapsedMs / 1000 / 60 / 60;
  return elapsedHours <= hours;
}

async function getPreviousDataQualitySummary(
  fc: FarosClient,
  cfg: any
): Promise<DataSummaryInterface | null> {
  const query = `query DQS_Query { faros_DataQualitySummary({order_by: {createdAt: desc}}) { uid createdAt counts }`;
  const result = await fc.gql(cfg.graph, query);
  if (result?.faros_DataQualitySummary?.length == 0) {
    return null;
  }
  const prev_DQS = result[0];
  if (checkIfCreatedWithinLastXHours(prev_DQS.createdAt, 25)) {
    return prev_DQS;
  } else {
    return null;
  }
}
