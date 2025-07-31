import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  ChatBreakdown,
  CopilotUsageSummary,
  LanguageEditorBreakdown,
  ModelBreakdown,
} from 'faros-airbyte-common/github';
import {Utils} from 'faros-js-client';
import {isNil, toLower} from 'lodash';

import {Edition, FLUSH} from '../../common/types';
import {Common} from '../common/common';
import {AssistantMetric, VCSToolCategory} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

const FarosMetricToAssistantMetricType = {
  DailySuggestionReferenceCount_Discard: AssistantMetric.SuggestionsDiscarded,
  DailySuggestionReferenceCount_Accept: AssistantMetric.SuggestionsAccepted,
  DailyGeneratedLineCount_Discard: AssistantMetric.LinesDiscarded,
  DailyGeneratedLineCount_Accept: AssistantMetric.LinesAccepted,
  DailyActiveUserTrend: AssistantMetric.ActiveUsers,
  DailyActiveChatUserTrend: AssistantMetric.ChatActiveUsers,
  DailyChatCount: AssistantMetric.ChatConversations,
  DailyChatInsertionCount: AssistantMetric.ChatInsertionEvents,
  DailyChatCopyCount: AssistantMetric.ChatCopyEvents,
};

export class FarosCopilotUsage extends GitHubConverter {
  private readonly recordsWithoutModelForDeletion: {
    [uid: string]: {day: string};
  } = {};
  private readonly writtenTags = new Set<string>();
  private writtenMetricDefinitions = false;

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_ApplicationMetric',
    'faros_MetricDefinition',
    'faros_MetricValue',
    'faros_MetricValueTag',
    'faros_Tag',
    'vcs_AssistantMetric',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const usage = record.record.data as CopilotUsageSummary;
    const res: DestinationRecord[] = [];
    const isCommunity =
      ctx?.config?.edition_configs?.edition === Edition.COMMUNITY;

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
      ['total_chats', 'DailyChatCount'],
      ['total_chat_insertion_events', 'DailyChatInsertionCount'],
      ['total_chat_copy_events', 'DailyChatCopyCount'],
    ]);

    const org = toLower(usage.org);
    const orgTagUid = getOrgTagUid(org);
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
    let team: string = null;
    if (usage.team) {
      team = toLower(usage.team);
      const teamTagUid = getTeamTagUid(org, team);
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

    this.processSummary(res, usage, metrics, org, team, isCommunity);

    return res;
  }

  private processSummary(
    res: DestinationRecord[],
    summary: CopilotUsageSummary,
    metrics: Map<string, string>,
    org: string,
    team: string | null,
    isCommunity: boolean
  ): void {
    this.calculateDiscards(summary);

    for (const [metric, farosMetric] of metrics) {
      if (isNil(summary[metric])) {
        continue;
      }

      this.processMetricValue(
        res,
        org,
        team,
        farosMetric,
        summary,
        metric,
        isCommunity
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
          org,
          team,
          farosMetric,
          breakdown,
          summary,
          breakdownMetric,
          isCommunity
        );
      }
    }

    if (summary.chat_breakdown) {
      for (const [metric, farosMetric] of metrics) {
        const breakdownMetric = metric.replace('total_', '');
        for (const chatBreakdown of summary.chat_breakdown) {
          if (
            isNil(chatBreakdown[breakdownMetric]) ||
            isNil(chatBreakdown.editor)
          ) {
            continue;
          }

          this.processChatBreakdownMetricValue(
            res,
            org,
            team,
            farosMetric,
            chatBreakdown,
            summary,
            breakdownMetric,
            isCommunity
          );
        }
      }
    }
  }

  private processBreakdownMetricValue(
    res: DestinationRecord[],
    org: string,
    team: string | null,
    farosMetric: string,
    breakdown: LanguageEditorBreakdown,
    summary: CopilotUsageSummary,
    breakdownMetric: string,
    isCommunity: boolean
  ): void {
    const normalizeDimension = (dimensionName: string): string => {
      return toLower(dimensionName).split(' ').join('_');
    };

    // Example breakdownMetricValueUid:
    // copilotOrg__faros-ai-DailyActiveUserTrend-angular2html-jetbrains-2024-01-15
    const orgTagUid = getOrgTagUid(org);
    const teamTagUid = team ? getTeamTagUid(org, team) : null;
    const breakdownMetricValueUid = `${teamTagUid ? teamTagUid : orgTagUid}-${farosMetric}-${normalizeDimension(
      breakdown.language
    )}-${normalizeDimension(breakdown.editor)}-${summary.day}`;
    const day = Utils.toDate(summary.day);
    res.push({
      model: 'faros_MetricValue',
      record: {
        uid: breakdownMetricValueUid,
        value: String(breakdown[breakdownMetric]),
        computedAt: day,
        definition: {uid: farosMetric},
      },
    });
    if (!isCommunity) {
      const assistantMetricType = FarosMetricToAssistantMetricType[farosMetric];
      if (assistantMetricType) {
        const assistantMetricWithoutModel = this.getAssistantMetric(
          day,
          assistantMetricType,
          breakdown[breakdownMetric] as number,
          org,
          team,
          breakdown.editor,
          breakdown.language
        );
        if (!breakdown.model_breakdown) {
          res.push(assistantMetricWithoutModel);
        } else {
          for (const modelBreakdown of breakdown.model_breakdown) {
            if (
              isNil(modelBreakdown[breakdownMetric]) ||
              isNil(modelBreakdown.model)
            ) {
              continue;
            }
            res.push(
              this.getAssistantMetric(
                day,
                assistantMetricType,
                modelBreakdown[breakdownMetric] as number,
                org,
                team,
                breakdown.editor,
                breakdown.language,
                modelBreakdown.model
              )
            );
          }
          this.recordsWithoutModelForDeletion[
            assistantMetricWithoutModel.record.uid
          ] = {
            day: summary.day,
          };
        }
      }
    }

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

  private processChatBreakdownMetricValue(
    res: DestinationRecord[],
    org: string,
    team: string | null,
    farosMetric: string,
    chatBreakdown: ChatBreakdown,
    summary: CopilotUsageSummary,
    breakdownMetric: string,
    isCommunity: boolean
  ): void {
    if (isCommunity) {
      return;
    }

    const assistantMetricType = FarosMetricToAssistantMetricType[farosMetric];
    if (!assistantMetricType) {
      return;
    }

    const day = Utils.toDate(summary.day);
    for (const modelBreakdown of chatBreakdown.model_breakdown) {
      if (
        isNil(modelBreakdown[breakdownMetric]) ||
        isNil(modelBreakdown.model)
      ) {
        continue;
      }
      res.push(
        this.getAssistantMetric(
          day,
          assistantMetricType,
          modelBreakdown[breakdownMetric] as number,
          org,
          team,
          chatBreakdown.editor,
          undefined,
          modelBreakdown.model
        )
      );
    }
  }

  private processMetricValue(
    res: DestinationRecord[],
    org: string,
    team: string | null,
    farosMetric: string,
    summary: CopilotUsageSummary,
    metric: string,
    isCommunity: boolean
  ): void {
    const orgTagUid = getOrgTagUid(org);
    const teamTagUid = team ? getTeamTagUid(org, team) : null;
    const metricValueUid = `${teamTagUid ? teamTagUid : orgTagUid}-${farosMetric}-${summary.day}`;
    const day = Utils.toDate(summary.day);
    res.push({
      model: 'faros_MetricValue',
      record: {
        uid: metricValueUid,
        value: String(summary[metric]),
        computedAt: day,
        definition: {uid: farosMetric},
      },
    });
    if (!isCommunity) {
      const assistantMetricType = FarosMetricToAssistantMetricType[farosMetric];
      if (assistantMetricType) {
        res.push(
          this.getAssistantMetric(
            day,
            assistantMetricType,
            summary[metric],
            org,
            team
          )
        );
      }
    }

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
      object: CopilotUsageSummary | LanguageEditorBreakdown | ModelBreakdown,
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

        if (
          !isNil(breakdown.model_breakdown) &&
          Array.isArray(breakdown.model_breakdown)
        ) {
          for (const modelBreakdown of breakdown.model_breakdown) {
            calculateDifference(
              modelBreakdown,
              'suggestions_count',
              'acceptances_count',
              'discards_count'
            );
            calculateDifference(
              modelBreakdown,
              'lines_suggested',
              'lines_accepted',
              'lines_discarded'
            );
          }
        }
      }
    }
  }

  private getAssistantMetric(
    day: Date,
    assistantMetricType: AssistantMetric,
    value: number,
    org: string,
    team: string | null,
    editor?: string,
    language?: string,
    model?: string
  ): DestinationRecord {
    return {
      model: 'vcs_AssistantMetric',
      record: {
        uid: GitHubCommon.digest(
          []
            .concat(
              // original fields (required) to be included in the digest
              ...[
                VCSToolCategory.GitHubCopilot,
                assistantMetricType,
                day.toISOString(),
                org,
                team,
                editor,
                language,
              ],
              // newer fields (optional) to be included in the digest
              ...[{key: 'model', value: model}]
                .filter((v) => !isNil(v.value))
                .map((v) => `${v.key}:${v.value}`)
            )
            .join('__')
        ),
        source: this.streamName.source,
        startedAt: day,
        endedAt: Utils.toDate(day.getTime() + 24 * 60 * 60 * 1000),
        type: {category: assistantMetricType},
        valueType: 'Int',
        value: String(value),
        organization: {
          uid: org,
          source: this.streamName.source,
        },
        ...(team && {
          team: {
            uid: team,
          },
        }),
        tool: {category: VCSToolCategory.GitHubCopilot},
        editor,
        language,
        model,
      },
    };
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    // make sure we delete old records without model for the same partition
    // that could have been written to avoid duplicated / redundant data
    for (const [uid, {day}] of Object.entries(this.recordsWithoutModelForDeletion)) {
      res.push({
        model: 'vcs_AssistantMetric__Deletion',
        record: {
          flushRequired: false,
          where: {
            uid,
            startedAt: day, // include to benefit from the index on startedAt and improve performance
          },
        },
      });
    }
    res.push(FLUSH);
    return res;
  }
}

const getOrgTagUid = (org: string): string => `copilotOrg__${toLower(org)}`;

const getTeamTagUid = (org: string, team: string): string =>
  `copilotTeam__${toLower(org)}/${toLower(team)}`;
