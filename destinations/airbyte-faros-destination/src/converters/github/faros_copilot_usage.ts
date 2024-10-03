import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  CopilotUsageSummary,
  LanguageEditorBreakdown,
} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {isNil, toLower} from 'lodash';

import {Common} from '../common/common';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';

export class FarosCopilotUsage extends GitHubConverter {
  private readonly writtenTags = new Set<string>();
  private writtenMetricDefinitions = false;

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_ApplicationMetric',
    'faros_MetricDefinition',
    'faros_MetricValue',
    'faros_MetricValueTag',
    'faros_Tag',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const usage = record.record.data as CopilotUsageSummary;
    const res: DestinationRecord[] = [];

    // Usage metric to Faros metric definition uid
    const metrics = new Map<string, string>([
      ['total_discards_count', 'DailySuggestionReferenceCount_Discard'],
      ['total_acceptances_count', 'DailySuggestionReferenceCount_Accept'],
      ['total_lines_discarded', 'DailyGeneratedLineCount_Discard'],
      ['total_lines_accepted', 'DailyGeneratedLineCount_Accept'],
      ['total_active_users', 'DailyActiveUserTrend'],
      ['total_chat_acceptances', 'DailyChatAcceptanceCount'],
      ['total_chat_turns', 'DailyChatTurnCount'],
      ['total_active_chat_users', 'DailyActiveChatUserTrend'],
    ]);

    const org = toLower(usage.org);
    const orgTagUid = `copilotOrg__${org}`;
    if (!this.writtenTags.has(orgTagUid)) {
      res.push({
        model: 'faros_Tag',
        record: {
          uid: orgTagUid,
          key: 'copilotOrg',
          value: org,
        },
      });
      this.writtenTags.add(orgTagUid);
    }
    let teamTagUid: string = null;
    if (usage.team) {
      const team = toLower(usage.team);
      teamTagUid = `copilotTeam__${org}/${team}`;
      if (!this.writtenTags.has(teamTagUid)) {
        res.push({
          model: 'faros_Tag',
          record: {
            uid: teamTagUid,
            key: 'copilotTeam',
            value: team,
          },
        });
        this.writtenTags.add(teamTagUid);
      }
    }

    if (!this.writtenMetricDefinitions) {
      for (const farosMetric of metrics.values()) {
        res.push({
          model: 'faros_MetricDefinition',
          record: {
            uid: farosMetric,
            name: farosMetric,
            valueType: {
              category: 'Numeric',
              detail: null,
            },
          },
        });
      }
      this.writtenMetricDefinitions = true;
    }

    this.processSummary(res, usage, metrics, orgTagUid, teamTagUid);

    return res;
  }

  private processSummary(
    res: DestinationRecord[],
    summary: CopilotUsageSummary,
    metrics: Map<string, string>,
    orgTagUid: string,
    teamTagUid: string | null
  ): void {
    this.calculateDiscards(summary);

    for (const [metric, farosMetric] of metrics) {
      if (isNil(summary[metric])) {
        continue;
      }

      this.processMetricValue(
        res,
        orgTagUid,
        teamTagUid,
        farosMetric,
        summary,
        metric
      );

      const breakdownMetric = metric.replace('total_', '');
      for (const breakdown of summary.breakdown) {
        if (
          isNil(breakdown[breakdownMetric]) ||
          isNil(breakdown.language) ||
          isNil(breakdown.editor)
        ) {
          continue;
        }

        this.processBreakdownMetricValue(
          res,
          orgTagUid,
          teamTagUid,
          farosMetric,
          breakdown,
          summary,
          breakdownMetric
        );
      }
    }
  }

  private processBreakdownMetricValue(
    res: DestinationRecord[],
    orgTagUid: string,
    teamTagUid: string | null,
    farosMetric: string,
    breakdown: LanguageEditorBreakdown,
    summary: CopilotUsageSummary,
    breakdownMetric: string
  ): void {
    const normalizeDimension = (dimensionName: string): string => {
      return toLower(dimensionName).split(' ').join('_');
    };

    // Example breakdownMetricValueUid:
    // copilotOrg__faros-ai-DailyActiveUserTrend-angular2html-jetbrains-2024-01-15
    const breakdownMetricValueUid = `${teamTagUid ? teamTagUid : orgTagUid}-${farosMetric}-${normalizeDimension(
      breakdown.language
    )}-${normalizeDimension(breakdown.editor)}-${summary.day}`;
    res.push({
      model: 'faros_MetricValue',
      record: {
        uid: breakdownMetricValueUid,
        value: String(breakdown[breakdownMetric]),
        computedAt: Utils.toDate(summary.day),
        definition: {uid: farosMetric},
      },
    });

    const languageTagUid = `copilotLanguage__${normalizeDimension(
      breakdown.language
    )}`;
    if (!this.writtenTags.has(languageTagUid)) {
      res.push({
        model: 'faros_Tag',
        record: {
          uid: languageTagUid,
          key: 'copilotLanguage',
          value: breakdown.language,
        },
      });
      this.writtenTags.add(languageTagUid);
    }

    const editorTagUid = `copilotEditor__${normalizeDimension(
      breakdown.editor
    )}`;
    if (!this.writtenTags.has(editorTagUid)) {
      res.push({
        model: 'faros_Tag',
        record: {
          uid: editorTagUid,
          key: 'copilotEditor',
          value: breakdown.editor,
        },
      });
      this.writtenTags.add(editorTagUid);
    }

    for (const tagUid of [
      languageTagUid,
      editorTagUid,
      orgTagUid,
      teamTagUid,
    ]) {
      if (!tagUid) {
        continue;
      }
      res.push({
        model: 'faros_MetricValueTag',
        record: {
          tag: {uid: tagUid},
          value: {
            uid: breakdownMetricValueUid,
            definition: {uid: farosMetric},
          },
        },
      });
    }

    res.push({
      model: 'compute_ApplicationMetric',
      record: {
        application: Common.computeApplication('copilot', ''),
        value: {
          uid: breakdownMetricValueUid,
          definition: {uid: farosMetric},
        },
      },
    });
  }

  private processMetricValue(
    res: DestinationRecord[],
    orgTagUid: string,
    teamTagUid: string | null,
    farosMetric: string,
    summary: CopilotUsageSummary,
    metric: string
  ): void {
    const metricValueUid = `${teamTagUid ? teamTagUid : orgTagUid}-${farosMetric}-${summary.day}`;
    res.push({
      model: 'faros_MetricValue',
      record: {
        uid: metricValueUid,
        value: String(summary[metric]),
        computedAt: Utils.toDate(summary.day),
        definition: {uid: farosMetric},
      },
    });

    res.push({
      model: 'faros_MetricValueTag',
      record: {
        tag: {uid: orgTagUid},
        value: {
          uid: metricValueUid,
          definition: {uid: farosMetric},
        },
      },
    });

    if (teamTagUid) {
      res.push({
        model: 'faros_MetricValueTag',
        record: {
          tag: {uid: teamTagUid},
          value: {
            uid: metricValueUid,
            definition: {uid: farosMetric},
          },
        },
      });
    }

    res.push({
      model: 'compute_ApplicationMetric',
      record: {
        application: Common.computeApplication('copilot', ''),
        value: {
          uid: metricValueUid,
          definition: {uid: farosMetric},
        },
      },
    });
  }

  private calculateDiscards(summary: CopilotUsageSummary): void {
    const calculateDifference = (
      object: CopilotUsageSummary | LanguageEditorBreakdown,
      field1: string,
      field2: string,
      resultField: string
    ): void => {
      if (!isNil(object[field1]) && !isNil(object[field2])) {
        object[resultField] = object[field1] - object[field2];
      }
    };

    calculateDifference(
      summary,
      'total_suggestions_count',
      'total_acceptances_count',
      'total_discards_count'
    );
    calculateDifference(
      summary,
      'total_lines_suggested',
      'total_lines_accepted',
      'total_lines_discarded'
    );

    if (!isNil(summary.breakdown) && Array.isArray(summary.breakdown)) {
      for (const breakdown of summary.breakdown) {
        calculateDifference(
          breakdown,
          'suggestions_count',
          'acceptances_count',
          'discards_count'
        );
        calculateDifference(
          breakdown,
          'lines_suggested',
          'lines_accepted',
          'lines_discarded'
        );
      }
    }
  }
}
