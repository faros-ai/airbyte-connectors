import {createHash} from 'crypto';
import {toDate} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import _ from 'lodash';

import {
  DestinationRecord,
  parseObjectConfig,
  StreamContext,
  StreamName,
} from '../../converter';
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

/** Configuration for the surveys stream */

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
};

export interface SurveysConfig {
  survey_responses_table_name?: string;
  survey_metadata_table_name?: string;
  question_metadata_table_name?: string;
  question_category_mapping?: QuestionCategoryMapping;
  column_names_mapping?: ColumnNameMapping;
}

/** Class containing common logic for processing surveys from different generic sources (Airtable, Sheets, ...)
 * It is injected in the specific converters for calling its methods and storing the state of the records processed
 * */

export class SurveysCommon {
  private questionMetadata: Map<string, SurveyQuestion> = new Map();
  private surveyMetadata: Map<string, Survey> = new Map();
  private surveyStats: Map<string, SurveyStats> = new Map();

  private usersSeen = new Set<string>();
  private teamsSeen = new Set<string>();
  private surveysSeen = new Set<string>();
  private questionsSeen = new Set<string>();

  private _config: SurveysConfig = undefined;
  private _questionCategoryMapping: QuestionCategoryMapping = undefined;

  private readonly streamName: StreamName;
  private readonly source: string;

  constructor(streamName: StreamName, source: string) {
    this.streamName = streamName;
    this.source = source;
  }

  public initialize(ctx: StreamContext): void {
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

  public get config(): SurveysConfig {
    return this._config;
  }

  public get questionCategoryMapping(): QuestionCategoryMapping {
    return this._questionCategoryMapping;
  }

  static getTeamUid(teamName: string): string | undefined {
    if (!teamName) {
      return undefined;
    }

    return this.digest(teamName);
  }

  static digest(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  public processQuestionMetadata(surveyId: string, row: any): void {
    const questionWithMetadata = this.getQuestionWithMetadata(surveyId, row);

    if (!questionWithMetadata) {
      return;
    }

    this.questionMetadata.set(questionWithMetadata.uid, questionWithMetadata);
  }

  public processSurveyMetadata(surveyId: string, row: any) {
    const surveyRecord = this.getSurveyRecord(surveyId, row);
    this.surveyMetadata.set(surveyRecord.uid, surveyRecord);
  }

  public processResponse(
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
    const question = row[this.config.column_names_mapping.question_column_name];

    if (!question) {
      return undefined;
    }

    const category =
      row[this.config.column_names_mapping.question_category_column_name];
    const responseType =
      row[this.config.column_names_mapping.response_type_column_name];

    return {
      uid: SurveysCommon.createQuestionUid(surveyId, question),
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

  public getResponseRecords(
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
      const questionId = SurveysCommon.createQuestionUid(surveyId, question);

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

      const questionResponse = {
        model: 'survey_QuestionResponse',
        record: {
          uid: responseId,
          source: this.source,
          submittedAt,
          response: row[question].toString(),
          surveyQuestion: {
            survey: {uid: surveyId, source: this.source},
            question: {uid: questionRecord.uid, source: this.source},
          },
          respondent: surveyUser
            ? {uid: surveyUser.uid, source: this.source}
            : null,
          team: surveyTeam ? {uid: surveyTeam.uid, source: this.source} : null,
        },
      };

      const res: DestinationRecord[] = [questionResponse];

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

  public updateSurveyStats(surveyId: string, questions: string[]) {
    const stats = this.surveyStats.get(surveyId) || {
      questionCount: questions.length,
      invitationCount: 0, // Invitation count is left at 0 as we don't have this data from coming from the sheets
      responseCount: 0,
    };
    stats.responseCount += 1;
    this.surveyStats.set(surveyId, stats);
  }

  public getFilteredQuestions(row: any) {
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
        row[this.config.column_names_mapping.survey_name_column_name] ?? null,
      type:
        row[this.config.column_names_mapping.survey_type_column_name] ?? null,
      description:
        row[this.config.column_names_mapping.survey_description_column_name] ??
        null,
      startedAt:
        row[this.config.column_names_mapping.survey_started_at_column_name] ??
        null,
      endedAt:
        row[this.config.column_names_mapping.survey_ended_at_column_name] ??
        null,
      status:
        row[this.config.column_names_mapping.survey_status_column_name] ?? null,
    };
  }

  private getSurveyUser(row: any): SurveyUser | undefined {
    const uid =
      row[this.config.column_names_mapping.respondent_email_column_name];

    if (!uid) {
      return undefined;
    }

    return {
      uid,
      source: this.source,
      email: uid,
      name:
        row[this.config.column_names_mapping.respondent_name_column_name] ??
        null,
    };
  }

  private getSurveyTeam(row: any): SurveyTeam | undefined {
    const uid =
      row[this.config.column_names_mapping.respondent_team_id_column_name] ??
      SurveysCommon.getTeamUid(
        row[this.config.column_names_mapping.respondent_team_name_column_name]
      );

    if (!uid) {
      return undefined;
    }

    return {
      uid,
      source: this.source,
      name: row[
        this.config.column_names_mapping.respondent_team_name_column_name
      ],
    };
  }

  static createQuestionUid(surveyId: string, question: string) {
    return this.digest(`${surveyId}-${question}`);
  }
}
