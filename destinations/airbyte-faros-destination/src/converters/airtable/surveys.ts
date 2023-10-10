import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, parseObjectConfig, StreamContext} from '../converter';
import {AirtableConverter} from './common';
import {
  SurveyCategory,
  SurveyQuestionCategory,
  SurveyResponseCategory,
  SurveyStatusCategory,
  SurveyTeam,
  SurveyUser,
} from './models';
import {createHash} from "crypto";
import { QueryBuilder } from 'faros-js-client';

type QuestionCategoryMapping = Record<string, string>;

interface SurveysConfig {
  question_category_mapping?: QuestionCategoryMapping;
  survey_name?: string;
  survey_description?: string;
  survey_type?: SurveyCategory;
  survey_started_at?: string;
  survey_ended_at?: string;
  question_column_index_start?: number; // Index of the first question column header
  id_column_name?: string;
  survey_name_column_name?: string;
  survey_type_column_name?: string;
  name_column_name?: string;
  email_column_name?: string;
  team_column_name?: string;
}

export class Surveys extends AirtableConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'survey_Survey',
    'survey_Question',
    'survey_SurveyQuestionAssociation',
    'survey_QuestionResponse',
    'survey_User',
    'survey_Team',
    'survey_TeamMembership',
    'survey_OrgTeam',
  ];

  private surveyQuestionsWithMetadata = [];

  protected config(ctx: StreamContext): SurveysConfig {
    return ctx.config.source_specific_configs?.airtable ?? {};
  }

  protected questionCategoryMapping(ctx: StreamContext): QuestionCategoryMapping {
    return (
      parseObjectConfig(
        this.config(ctx)?.question_category_mapping,
        'Question Category Mapping'
      ) ?? {}
    );
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const config = this.config(ctx);
    const row = record?.record?.data?.row;
    // make row fields (object) to be this: Test Field instead of this test_field
    // TODO: REMOVE THIS WHEN AIRTABLE SOURCE STREAM IS FIXED
    Object.keys(row).forEach((key) => {
      // split in _, add upper case to first letter and join whit space
      const newKey = key.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      row[newKey] = row[key];
      delete row[key];
    });
    const questions = Object.keys(row).slice(config.question_column_index_start);
    const source = this.streamName.source;
    const res = [];

    let surveyUser: SurveyUser;
    let surveyTeam: SurveyTeam;

    // Check if row contains user data for pushing user records
    if (
      row[config.name_column_name] &&
      row[config.email_column_name] &&
      row[config.team_column_name]
    ) {
      surveyUser = {
        uid: row[config.email_column_name],
        email: row[config.email_column_name],
        name: row[config.name_column_name],
        source,
      };

      surveyTeam = {
        uid: row[config.team_column_name],
        name: row[config.team_column_name],
        description: row[config.team_column_name],
        source,
      };

      res.push(
        ...[
          {
            model: 'survey_User',
            record: surveyUser,
          },
          {
            model: 'survey_Team',
            record: surveyTeam,
          },
          {
            model: 'survey_TeamMembership',
            record: {
              member: surveyUser,
              team: surveyTeam,
            },
          },
          {
            model: 'survey_OrgTeam',
            record: {
              surveyTeam: surveyTeam,
              // TODO: query org_Team by uid
              orgTeam: {
                uid: `${surveyTeam.name.toLowerCase().split(' ').join('-')}`,
              },
            },
          },
        ]
      );
    }

    const tableId =  record?.record?.data?._airtable_table_id;
    const recordId = this.id(record)
    const submittedAt = record?.record?.data?._airtable_created_time;

    // Check if row contains is question metadata for pushing it to survey questions metadata records
    // TODO: make metadata fields configurable and this ones default
    const isQuestionMetadata = row['Question'] && row['Category'] && row['Response Category'];
    if (isQuestionMetadata) {
      const questionCategoryMapping = this.questionCategoryMapping(ctx);
      const questionWithMetadata = this.getQuestionsWithMetadata(row, questionCategoryMapping, source);
      this.surveyQuestionsWithMetadata.push(questionWithMetadata);
      return [];
    }

    const surveyQuestionRecs = this.getSurveyQuestionRecords(
      questions,
      tableId,
      recordId,
      submittedAt,
      row,
      config,
      source,
      surveyUser,
      surveyTeam
    );
    res.push(...surveyQuestionRecs);
    return res;
  }

  /** Upsert survey questions recors with metadata (question category and response type) **/
  async onProcessingComplete(ctx: StreamContext): Promise<ReadonlyArray<DestinationRecord>> {
    const qb = new QueryBuilder(ctx.origin)
    const mutations = [];
    this.surveyQuestionsWithMetadata.map((survey_Question) => {
      mutations.push(qb.upsert({survey_Question}))
    });
    await ctx.farosClient?.sendMutations(ctx.graph, mutations);
    return [];
  }

  private getQuestionsWithMetadata(row: any, questionCategoryMapping: QuestionCategoryMapping, source: string) {
    const questionCategory = this.getQuestionCategory(row['Category'], questionCategoryMapping);
    const responseType = this.getResponseType(row['Response Category']);
    const question = row['Question'];
    const questionId = this.getQuestionUid(question);
    return {
      uid: questionId,
      question: question,
      description: question,
      source: source,
      questionCategory: questionCategory,
      responseType: responseType,
    }
  }

  private getSurveyQuestionRecords(
    questions: string[],
    tableId: string,
    recordId: string,
    submittedAt: string,
    row: any,
    config: SurveysConfig,
    source: string,
    surveyUser: SurveyUser,
    surveyTeam: SurveyTeam
  ) {
    return questions.flatMap((question, index) => {
      // If id column is not specified and default column name has no value, default to airtable id
      const surveyId = row[config.id_column_name] ? row[config.id_column_name] : tableId;
      const surveyType = this.getSurveyType(config.survey_type);
      const surveyStatus = this.getSurveyStatus(config.survey_started_at, config.survey_ended_at);
      const surveyRecord = {
        uid: surveyId,
        source: source,
        name: config.survey_name,
        description: config.survey_description,
        type: surveyType,
        status: surveyStatus,
        startedAt: config.survey_started_at,
        endedAt: config.survey_ended_at,
      };

      // Generate digest from question text to create uid
      const questionId = this.getQuestionUid(question);
      const questionRecord = {
        uid: questionId,
        question: question,
        description: question,
        source,
      };
      const surveyQuestionAssociationRecord = {
        survey: surveyRecord,
        question: questionRecord,
        order: index + 1,
      };
      const questionResponse = {
        model: 'survey_QuestionResponse',
        record: {
          uid: recordId,
          source,
          submittedAt,
          response: row[question],
          surveyQuestion: surveyQuestionAssociationRecord,
          respondent: surveyUser,
          team: surveyTeam,
        },
      };
      return [
        questionResponse,
        {
          model: 'survey_Survey',
          record: surveyRecord,
        },
        {
          model: 'survey_Question',
          record: questionRecord,
        },
        {
          model: 'survey_SurveyQuestionAssociation',
          record: surveyQuestionAssociationRecord,
        },
      ];
    });
  }

  getSurveyType(type: string) {
    const farosType = SurveyCategory[type];
    if (farosType) {
      return {
        category: farosType,
        detail: type,
      };
    }
    return {
      category: SurveyCategory.Custom,
      detail: type,
    }
  }

  getSurveyStatus(startedAt: string, endedAt: string) {
    if (!startedAt && !endedAt) {
      return {
        category: SurveyStatusCategory.Planned,
        detail: SurveyStatusCategory.Planned,
      };
    }
    if (startedAt && !endedAt) {
      return {
        category: SurveyStatusCategory.InProgress,
        detail: SurveyStatusCategory.InProgress,
      };
    }
    if (startedAt && endedAt) {
      return {
        category: SurveyStatusCategory.Completed,
        detail: SurveyStatusCategory.Completed,
      };
    }
    return {
      category: SurveyStatusCategory.Custom,
      detail: SurveyStatusCategory.Custom,
    }
  }

  getQuestionCategory(category: string, questionCategoryMapping: QuestionCategoryMapping) {
    const farosCategory = SurveyQuestionCategory[category];
    if (farosCategory) {
      return {
        category: farosCategory,
        detail: category,
      };
    }
    const mappedCategory = questionCategoryMapping[category];
    if (mappedCategory) {
      return {
        category: mappedCategory,
        detail: category,
      };
    }
    return {
      category: SurveyQuestionCategory.Custom,
      detail: category,
    }
  }

  getResponseType(category: string) {
    const farosCategory = SurveyResponseCategory[category];
    if (farosCategory) {
      return {
        category: farosCategory,
        detail: category,
      };
    }
    return {
      category: SurveyResponseCategory.Custom,
      detail: category,
    }
  }

  getQuestionUid(question: string) {
    return createHash('md5').update(question).digest('hex');
  }
}
