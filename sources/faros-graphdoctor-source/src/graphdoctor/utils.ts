import {DataIssueWrapper} from './models';

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

export function get_missing_relation_data_issues_from_result_list(
  res_list: any[],
  main_obj: string,
  crt_timestamp: string,
  fixed_field: string
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
      },
    });
  }
  return data_issues;
}
