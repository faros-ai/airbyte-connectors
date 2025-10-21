import {createHash} from 'crypto';
import {AirbyteRecord, toDate} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import _ from 'lodash';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  parseObjectConfig,
  StreamContext,
} from '../converter';
import {
  QuestionCategoryMapping,
  Survey,
  SurveyCategory,
  SurveyQuestion,
  SurveyQuestionCategory,
  SurveyResponseCategory,
  SurveyStats,
  SurveyStatusCategory,
  SurveyTeam,
  SurveyUser,
} from './models';

type ColumnNameMapping = {
  survey_name_column_name?: string;
  survey_type_column_name?: string;
  survey_description_column_name?: string;
  survey_started_at_column_name?: string;
  survey_ended_at_column_name?: string;
  survey_status_column_name?: string;
  respondent_name_column_name?: string;
  respondent_email_column_name?: string;
  respondent_team_name_column_name?: string;
  respondent_team_id_column_name?: string;
  question_category_column_name?: string;
  response_type_column_name?: string;
  question_column_name?: string;
  response_submitted_at_column_name?: string;
};

export interface SurveysConfig {
  survey_responses_table_name?: string;
  survey_metadata_table_name?: string;
  question_metadata_table_name?: string;
  question_category_mapping?: QuestionCategoryMapping;
  column_names_mapping?: ColumnNameMapping;
  exclude_columns?: ReadonlyArray<string>;
}

const RespondentTeamIdColumnFallback = 'What is your team?';

export abstract class AbstractSurveys extends Converter {
  abstract getSurveyId(record: AirbyteRecord): string | undefined;
  abstract getTableName(record: AirbyteRecord): string | undefined;

  getSubmittedAt(record: AirbyteRecord): string | undefined {
    const submittedAtColumnName =
      this.config.column_names_mapping.response_submitted_at_column_name;
    return AbstractSurveys.getColumnValue(
      record?.record?.data?.row,
      submittedAtColumnName
    );
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'survey_Survey',
    'survey_Question',
    'survey_SurveyQuestionAssociation',
    'survey_QuestionResponse',
    'survey_User',
    'survey_Team',
    'survey_TeamMembership',
  ];

  private questionMetadata: Map<string, SurveyQuestion> = new Map();
  private surveyMetadata: Map<string, Survey> = new Map();
  private surveyStats: Map<string, SurveyStats> = new Map();

  private usersSeen = new Set<string>();
  private teamsSeen = new Set<string>();
  private surveysSeen = new Set<string>();
  private questionsSeen = new Set<string>();

  private _config: SurveysConfig = undefined;
  private _questionCategoryMapping: QuestionCategoryMapping = undefined;

  private initialize(ctx: StreamContext): void {
    this._config =
      this._config ?? ctx.config.source_specific_configs?.surveys ?? {};
    this._questionCategoryMapping =
      this._questionCategoryMapping ??
      parseObjectConfig(
        this._config?.question_category_mapping,
        'Question Category Mapping'
      ) ??
      {};
  }

  protected get config(): SurveysConfig {
    return this._config;
  }

  private get questionCategoryMapping(): QuestionCategoryMapping {
    return this._questionCategoryMapping;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    this.initialize(ctx);

    const row = record?.record?.data?.row;
    const surveyId = this.getSurveyId(record);
    const tableName = this.getTableName(record);

    if (!row || !surveyId || !tableName) {
      return [];
    }

    // Be a bit more lenient with table names matching
    const normalizeTableName = (tableName: string): string => {
      return tableName.toLowerCase().split(' ').join('_');
    };

    // Question metadata
    if (
      normalizeTableName(tableName) ===
      normalizeTableName(this.config.question_metadata_table_name)
    ) {
      this.processQuestionMetadata(surveyId, row);
      return [];
    }

    // Survey metadata
    if (
      normalizeTableName(tableName) ===
      normalizeTableName(this.config.survey_metadata_table_name)
    ) {
      this.processSurveyMetadata(surveyId, row);
      return [];
    }

    // Survey response
    if (
      normalizeTableName(tableName) ===
      normalizeTableName(this.config.survey_responses_table_name)
    ) {
      const responseId = this.id(record);
      const submittedAt = this.getSubmittedAt(record);

      const questions = this.getFilteredQuestions(row);
      const res = this.processResponse(
        surveyId,
        row,
        responseId,
        submittedAt,
        questions
      );

      // Update survey stats for pushing on processing complete
      this.updateSurveyStats(surveyId, questions);

      return res;
    }

    return [];
  }

  private processQuestionMetadata(surveyId: string, row: any): void {
    const questionWithMetadata = this.getQuestionWithMetadata(surveyId, row);

    if (!questionWithMetadata) {
      return;
    }

    this.questionMetadata.set(questionWithMetadata.uid, questionWithMetadata);
  }

  private processSurveyMetadata(surveyId: string, row: any) {
    const surveyRecord = this.getSurveyRecord(surveyId, row);
    this.surveyMetadata.set(surveyRecord.uid, surveyRecord);
  }

  private processResponse(
    surveyId: string,
    row: any,
    responseId: string,
    submittedAt: string,
    questions: string[]
  ) {
    const res = [];

    const surveyUser: SurveyUser | undefined = this.getSurveyUser(row);
    const surveyTeam: SurveyTeam | undefined = this.getSurveyTeam(row);

    if (surveyUser && !this.usersSeen.has(surveyUser.uid)) {
      this.usersSeen.add(surveyUser.uid);
      res.push({
        model: 'survey_User',
        record: surveyUser,
      });
    }

    if (surveyTeam && !this.teamsSeen.has(surveyTeam.uid)) {
      this.teamsSeen.add(surveyTeam.uid);
      res.push({
        model: 'survey_Team',
        record: surveyTeam,
      });
    }

    if (surveyUser && surveyTeam) {
      res.push({
        model: 'survey_TeamMembership',
        record: {
          member: _.pick(surveyUser, ['uid', 'source']),
          team: _.pick(surveyTeam, ['uid', 'source']),
        },
      });
    }

    res.push(
      ...this.getResponseRecords(
        surveyId,
        row,
        responseId,
        submittedAt,
        questions,
        surveyUser,
        surveyTeam
      )
    );
    return res;
  }

  /** Upsert surveys to add stats and survey questions records to include metadata (question category and response type) **/
  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const updateRecords = [];
    // Add survey questions upsert mutations
    this.questionMetadata.forEach((surveyQuestion) => {
      const questionRecord = {
        model: 'survey_Question__Update',
        record: {
          at: Date.now(),
          where: {uid: surveyQuestion.uid, source: surveyQuestion.source},
          mask: ['questionCategory', 'responseType'],
          patch: {
            questionCategory: surveyQuestion.questionCategory,
            responseType: surveyQuestion.responseType,
          },
        },
      };
      updateRecords.push(questionRecord);
    });

    this.surveyStats.forEach((surveyStats, surveyId) => {
      const surveyRecord = {
        model: 'survey_Survey__Update',
        record: {
          at: Date.now(),
          where: {uid: surveyId, source: this.streamName.source},
          mask: ['stats'],
          patch: {
            stats: surveyStats,
          },
        },
      };
      updateRecords.push(surveyRecord);
    });

    this.surveyMetadata.forEach((survey) => {
      updateRecords.push({
        model: 'survey_Survey__Update',
        record: {
          at: Date.now(),
          where: {
            uid: survey.uid,
            source: this.streamName.source,
          },
          mask: [
            'name',
            'description',
            'type',
            'status',
            'startedAt',
            'endedAt',
          ],
          patch: {
            name: survey.name,
            description: survey.description,
            type: survey.type,
            status: survey.status,
            startedAt: survey.startedAt,
            endedAt: survey.endedAt,
          },
        },
      });
    });

    return updateRecords;
  }

  private getQuestionWithMetadata(surveyId: string, row: any): SurveyQuestion {
    const question = AbstractSurveys.getColumnValue(
      row,
      this.config.column_names_mapping.question_column_name
    );

    if (!question) {
      return undefined;
    }

    const category = AbstractSurveys.getColumnValue(
      row,
      this.config.column_names_mapping.question_category_column_name
    );
    const responseType = AbstractSurveys.getColumnValue(
      row,
      this.config.column_names_mapping.response_type_column_name
    );

    return {
      uid: AbstractSurveys.createQuestionUid(surveyId, question),
      source: this.source,
      questionCategory: category
        ? Utils.toCategoryDetail(
            SurveyQuestionCategory,
            category,
            this.questionCategoryMapping
          )
        : null,
      responseType: responseType
        ? Utils.toCategoryDetail(SurveyResponseCategory, responseType)
        : null,
    };
  }

  private getResponseRecords(
    surveyId: string,
    row: any,
    responseId: string,
    submittedAt: string,
    questions: string[],
    surveyUser?: SurveyUser,
    surveyTeam?: SurveyTeam
  ) {
    return questions.flatMap((question, index) => {
      const surveyRecord = this.getSurveyRecord(surveyId, row);
      const questionId = AbstractSurveys.createQuestionUid(surveyId, question);

      const questionRecord = {
        uid: questionId,
        source: this.source,
        question,
      };

      const surveyQuestionAssociationRecord = {
        survey: {uid: surveyId, source: this.source},
        question: {uid: questionRecord.uid, source: this.source},
        order: index + 1,
      };

      const res: DestinationRecord[] = [];

      const questionResponse = AbstractSurveys.getColumnValue(row, question);

      if (questionResponse) {
        const questionResponseRecord = {
          model: 'survey_QuestionResponse',
          record: {
            uid: responseId,
            source: this.source,
            submittedAt,
            response: questionResponse.toString(),
            surveyQuestion: {
              survey: {uid: surveyId, source: this.source},
              question: {uid: questionRecord.uid, source: this.source},
            },
            respondent: surveyUser
              ? {uid: surveyUser.uid, source: this.source}
              : null,
            team: surveyTeam
              ? {uid: surveyTeam.uid, source: this.source}
              : null,
          },
        };
        res.push(questionResponseRecord);
      }

      if (!this.questionsSeen.has(questionRecord.uid)) {
        this.questionsSeen.add(questionRecord.uid);
        res.push(
          ...[
            {
              model: 'survey_Question',
              record: questionRecord,
            },
            {
              model: 'survey_SurveyQuestionAssociation',
              record: surveyQuestionAssociationRecord,
            },
          ]
        );
      }

      if (!this.surveysSeen.has(surveyId)) {
        this.surveysSeen.add(surveyId);
        res.push({
          model: 'survey_Survey',
          record: surveyRecord,
        });
      }

      return res;
    });
  }

  private getSurveyRecord(surveyId: string, row: any): Survey {
    const surveyData = this.getSurveyData(row);
    return {
      uid: surveyId,
      source: this.source,
      status: surveyData.status
        ? Utils.toCategoryDetail(SurveyStatusCategory, surveyData.status)
        : null,
      type: surveyData.type
        ? Utils.toCategoryDetail(SurveyCategory, surveyData.type)
        : null,
      name: surveyData.name,
      description: surveyData.description,
      startedAt: surveyData.startedAt ? toDate(surveyData.startedAt) : null,
      endedAt: surveyData.endedAt ? toDate(surveyData.endedAt) : null,
    };
  }

  private updateSurveyStats(surveyId: string, questions: string[]) {
    const stats = this.surveyStats.get(surveyId) || {
      questionCount: questions.length,
      invitationCount: 0, // Invitation count is left at 0 as we don't have this data from Airtable
      responseCount: 0,
    };
    stats.responseCount += 1;
    this.surveyStats.set(surveyId, stats);
  }

  private getFilteredQuestions(row: any): string[] {
    const excludeColumns = this.config.exclude_columns ?? [];
    return Object.keys(row).filter(
      (question) =>
        ![
          this.config.column_names_mapping.survey_name_column_name,
          this.config.column_names_mapping.survey_type_column_name,
          this.config.column_names_mapping.survey_description_column_name,
          this.config.column_names_mapping.survey_started_at_column_name,
          this.config.column_names_mapping.survey_ended_at_column_name,
          this.config.column_names_mapping.survey_status_column_name,
          this.config.column_names_mapping.respondent_name_column_name,
          this.config.column_names_mapping.respondent_email_column_name,
          this.config.column_names_mapping.respondent_team_name_column_name,
          this.config.column_names_mapping.respondent_team_id_column_name,
          this.config.column_names_mapping.response_submitted_at_column_name,
          ...excludeColumns,
        ].includes(question)
    );
  }

  private getSurveyData(row: any): {
    name: string | null;
    type: string | null;
    description: string | null;
    startedAt: string | null;
    endedAt: string | null;
    status: string | null;
  } {
    return {
      name:
        AbstractSurveys.getColumnValue(
          row,
          this.config.column_names_mapping.survey_name_column_name
        ) ?? null,
      type:
        AbstractSurveys.getColumnValue(
          row,
          this.config.column_names_mapping.survey_type_column_name
        ) ?? null,
      description:
        AbstractSurveys.getColumnValue(
          row,
          this.config.column_names_mapping.survey_description_column_name
        ) ?? null,
      startedAt:
        AbstractSurveys.getColumnValue(
          row,
          this.config.column_names_mapping.survey_started_at_column_name
        ) ?? null,
      endedAt:
        AbstractSurveys.getColumnValue(
          row,
          this.config.column_names_mapping.survey_ended_at_column_name
        ) ?? null,
      status:
        AbstractSurveys.getColumnValue(
          row,
          this.config.column_names_mapping.survey_status_column_name
        ) ?? null,
    };
  }

  private getSurveyUser(row: any): SurveyUser | undefined {
    const uid = AbstractSurveys.getColumnValue(
      row,
      this.config.column_names_mapping.respondent_email_column_name
    );

    if (!uid) {
      return undefined;
    }

    return {
      uid,
      source: this.source,
      email: uid,
      name:
        AbstractSurveys.getColumnValue(
          row,
          this.config.column_names_mapping.respondent_name_column_name
        ) ?? null,
    };
  }

  private getSurveyTeam(row: any): SurveyTeam | undefined {
    const uid =
      AbstractSurveys.getColumnValue(
        row,
        this.config.column_names_mapping.respondent_team_id_column_name
      ) ??
      AbstractSurveys.getTeamUid(
        AbstractSurveys.getColumnValue(
          row,
          this.config.column_names_mapping.respondent_team_name_column_name
        )
      ) ??
      AbstractSurveys.getColumnValue(row, RespondentTeamIdColumnFallback);

    if (!uid) {
      return undefined;
    }

    return {
      uid,
      source: this.source,
      name: AbstractSurveys.getColumnValue(
        row,
        this.config.column_names_mapping.respondent_team_name_column_name
      ),
    };
  }

  static createQuestionUid(surveyId: string, question: string) {
    return AbstractSurveys.digest(`${surveyId}-${question}`);
  }

  static getTeamUid(teamName: string): string | undefined {
    if (!teamName) {
      return undefined;
    }

    return AbstractSurveys.digest(teamName);
  }

  static digest(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  // Get column value either from string or an array of single string (lookup result)
  static getColumnValue(row: any, columnName: string): string | null {
    let columnValue = row[columnName];
    if (!columnValue) {
      return null;
    }
    if (Array.isArray(columnValue)) {
      return columnValue.length === 0 ? null : columnValue[0];
    }
    // Handle OOTB Survey case where we are using the respondent team id column name fallback
    // and value is in format "Team Name (team-uid)". It extracts the team-uid part.
    if (
      columnName === RespondentTeamIdColumnFallback &&
      typeof columnValue === 'string'
    ) {
      columnValue = AbstractSurveys.extractTeamIdFromParentheses(columnValue);
    }
    return columnValue;
  }
  /**
   * Extracts the team id from a string in the format "Team Name (team-uid)".
   * If the string does not contain parentheses, returns the original string.
   */
  private static extractTeamIdFromParentheses(value: string): string {
    const match = value.match(/\(([^)]+)\)/);
    return match ? match[1] : value;
  }
}
