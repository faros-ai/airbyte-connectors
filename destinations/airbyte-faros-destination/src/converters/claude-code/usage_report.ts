import {AirbyteRecord} from 'faros-airbyte-cdk';
import {UsageReportItem} from 'faros-airbyte-common/claude-code';
import {digest} from 'faros-airbyte-common/common';
import {Utils} from 'faros-js-client';
import {isNil} from 'lodash';

import {
  AssistantMetric,
  OrgKey,
  VCSToolCategory,
  VCSToolDetail,
} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClaudeCodeConverter, ClaudeCodeFeature} from './common';

export interface ClaudeCodeAssistantMetricConfig {
  startedAt: Date;
  endedAt: Date;
  assistantMetricType: AssistantMetric;
  value: number;
  organization: OrgKey;
  userEmail: string;
  customMetricName?: string;
  model?: string;
  feature?: ClaudeCodeFeature;
}

export class UsageReport extends ClaudeCodeConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
    'vcs_UserToolUsage',
  ];

  id(record: AirbyteRecord): string {
    const usageItem = record.record.data as UsageReportItem;
    return `${usageItem.date}__${usageItem.organization_id}__${usageItem.actor?.email_address || 'unknown'}`;
  }

  protected getAssistantMetric(
    config: ClaudeCodeAssistantMetricConfig
  ): DestinationRecord[] {
    const {
      startedAt,
      endedAt,
      assistantMetricType,
      value,
      organization,
      userEmail,
      customMetricName,
      model,
      feature,
    } = config;

    return [
      {
        model: 'vcs_AssistantMetric',
        record: {
          uid: digest(
            []
              .concat(
                // original fields (required) to be included in the digest
                ...[
                  VCSToolDetail.ClaudeCode,
                  assistantMetricType,
                  startedAt.toISOString(),
                  organization.uid,
                  userEmail,
                  customMetricName,
                ],
                // newer fields (optional) to be included in the digest
                ...[
                  {key: 'model', value: model},
                  {key: 'feature', value: feature},
                ]
                  .filter((v) => !isNil(v.value))
                  .map((v) => `${v.key}:${v.value}`)
              )
              .join('__')
          ),
          source: this.source,
          startedAt,
          endedAt,
          type: {
            category: assistantMetricType,
            ...(customMetricName && {detail: customMetricName}),
          },
          valueType: 'Int',
          value: String(value),
          organization,
          user: {uid: userEmail, source: this.streamName.source},
          tool: {
            category: VCSToolCategory.CodingAssistant,
            detail: VCSToolDetail.ClaudeCode,
          },
          ...(model && {model}),
          ...(feature && {feature}),
        },
      },
    ];
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const usageItem = record.record.data as UsageReportItem;

    if (!usageItem.actor?.email_address) {
      return [];
    }

    const day = Utils.toDate(usageItem.date);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);

    const organization = {
      uid: VCSToolDetail.ClaudeCode,
      source: this.streamName.source,
    };

    const res: DestinationRecord[] = [];
    const userEmail = usageItem.actor.email_address;

    // Core metrics: Lines of code
    if (usageItem.core_metrics?.lines_of_code?.added) {
      res.push(
        ...this.getAssistantMetric({
          startedAt: day,
          endedAt: nextDay,
          assistantMetricType: AssistantMetric.AILinesAdded,
          value: usageItem.core_metrics.lines_of_code.added,
          organization,
          userEmail,
        })
      );
    }

    if (usageItem.core_metrics?.lines_of_code?.removed) {
      res.push(
        ...this.getAssistantMetric({
          startedAt: day,
          endedAt: nextDay,
          assistantMetricType: AssistantMetric.AILinesRemoved,
          value: usageItem.core_metrics.lines_of_code.removed,
          organization,
          userEmail,
        })
      );
    }

    // Core metrics: Commits
    if (usageItem.core_metrics?.commits_by_claude_code) {
      res.push(
        ...this.getAssistantMetric({
          startedAt: day,
          endedAt: nextDay,
          assistantMetricType: AssistantMetric.CommitsCreated,
          value: usageItem.core_metrics.commits_by_claude_code,
          organization,
          userEmail,
        })
      );
    }

    // Core metrics: Pull Requests
    if (usageItem.core_metrics?.pull_requests_by_claude_code) {
      res.push(
        ...this.getAssistantMetric({
          startedAt: day,
          endedAt: nextDay,
          assistantMetricType: AssistantMetric.PullRequestsCreated,
          value: usageItem.core_metrics.pull_requests_by_claude_code,
          organization,
          userEmail,
        })
      );
    }

    // Core metrics: Sessions
    if (usageItem.core_metrics?.num_sessions) {
      res.push(
        ...this.getAssistantMetric({
          startedAt: day,
          endedAt: nextDay,
          assistantMetricType: AssistantMetric.Usages,
          value: usageItem.core_metrics.num_sessions,
          organization,
          userEmail,
        })
      );

      // Add UserToolUsage record for active usage
      res.push({
        model: 'vcs_UserToolUsage',
        record: {
          userTool: {
            user: {uid: userEmail, source: this.streamName.source},
            organization: {
              uid: VCSToolDetail.ClaudeCode,
              source: this.streamName.source,
            },
            tool: {
              category: VCSToolCategory.CodingAssistant,
              detail: VCSToolDetail.ClaudeCode,
            },
          },
          usedAt: day.toISOString(),
          recordedAt: day.toISOString(),
        },
      });
    }

    // Model breakdown: Cost per model
    if (usageItem.model_breakdown && usageItem.model_breakdown.length > 0) {
      for (const modelData of usageItem.model_breakdown) {
        if (modelData.estimated_cost?.amount) {
          res.push(
            ...this.getAssistantMetric({
              startedAt: day,
              endedAt: nextDay,
              assistantMetricType: AssistantMetric.Cost,
              value: modelData.estimated_cost.amount,
              organization,
              userEmail,
              model: modelData.model,
            })
          );
        }
      }
    }

    // Tool actions: Edit tool
    if (usageItem.tool_actions?.edit_tool) {
      if (usageItem.tool_actions.edit_tool.accepted) {
        res.push(
          ...this.getAssistantMetric({
            startedAt: day,
            endedAt: nextDay,
            assistantMetricType: AssistantMetric.SuggestionsAccepted,
            value: usageItem.tool_actions.edit_tool.accepted,
            organization,
            userEmail,
            feature: ClaudeCodeFeature.EditTool,
          })
        );
      }

      if (usageItem.tool_actions.edit_tool.rejected) {
        res.push(
          ...this.getAssistantMetric({
            startedAt: day,
            endedAt: nextDay,
            assistantMetricType: AssistantMetric.SuggestionsDiscarded,
            value: usageItem.tool_actions.edit_tool.rejected,
            organization,
            userEmail,
            feature: ClaudeCodeFeature.EditTool,
          })
        );
      }
    }

    // Tool actions: Multi-edit tool
    if (usageItem.tool_actions?.multi_edit_tool) {
      if (usageItem.tool_actions.multi_edit_tool.accepted) {
        res.push(
          ...this.getAssistantMetric({
            startedAt: day,
            endedAt: nextDay,
            assistantMetricType: AssistantMetric.SuggestionsAccepted,
            value: usageItem.tool_actions.multi_edit_tool.accepted,
            organization,
            userEmail,
            feature: ClaudeCodeFeature.MultiEditTool,
          })
        );
      }

      if (usageItem.tool_actions.multi_edit_tool.rejected) {
        res.push(
          ...this.getAssistantMetric({
            startedAt: day,
            endedAt: nextDay,
            assistantMetricType: AssistantMetric.SuggestionsDiscarded,
            value: usageItem.tool_actions.multi_edit_tool.rejected,
            organization,
            userEmail,
            feature: ClaudeCodeFeature.MultiEditTool,
          })
        );
      }
    }

    // Tool actions: Notebook edit tool
    if (usageItem.tool_actions?.notebook_edit_tool) {
      if (usageItem.tool_actions.notebook_edit_tool.accepted) {
        res.push(
          ...this.getAssistantMetric({
            startedAt: day,
            endedAt: nextDay,
            assistantMetricType: AssistantMetric.SuggestionsAccepted,
            value: usageItem.tool_actions.notebook_edit_tool.accepted,
            organization,
            userEmail,
            feature: ClaudeCodeFeature.NotebookEditTool,
          })
        );
      }

      if (usageItem.tool_actions.notebook_edit_tool.rejected) {
        res.push(
          ...this.getAssistantMetric({
            startedAt: day,
            endedAt: nextDay,
            assistantMetricType: AssistantMetric.SuggestionsDiscarded,
            value: usageItem.tool_actions.notebook_edit_tool.rejected,
            organization,
            userEmail,
            feature: ClaudeCodeFeature.NotebookEditTool,
          })
        );
      }
    }

    // Tool actions: Write tool
    if (usageItem.tool_actions?.write_tool) {
      if (usageItem.tool_actions.write_tool.accepted) {
        res.push(
          ...this.getAssistantMetric({
            startedAt: day,
            endedAt: nextDay,
            assistantMetricType: AssistantMetric.SuggestionsAccepted,
            value: usageItem.tool_actions.write_tool.accepted,
            organization,
            userEmail,
            feature: ClaudeCodeFeature.WriteTool,
          })
        );
      }

      if (usageItem.tool_actions.write_tool.rejected) {
        res.push(
          ...this.getAssistantMetric({
            startedAt: day,
            endedAt: nextDay,
            assistantMetricType: AssistantMetric.SuggestionsDiscarded,
            value: usageItem.tool_actions.write_tool.rejected,
            organization,
            userEmail,
            feature: ClaudeCodeFeature.WriteTool,
          })
        );
      }
    }

    return res;
  }
}
