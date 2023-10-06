import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {SheetsConfig, SheetsConverter} from './common';
import {
  SurveyCategory,
  SurveyQuestionCategory,
  SurveyResponseCategory,
  SurveyStatusCategory,
  SurveyTeam,
  SurveyUser,
} from './models';

interface SurveysConfig extends SheetsConfig {
  survey_name: string;
  survey_description: string;
  survey_type: SurveyCategory;
  question_column_index_start?: number; // index of the first question column header
  id_column_name?: string;
  name_column_name?: string;
  email_column_name?: string;
  team_column_name?: string;
  submitted_at_column_name?: string;
}

const DEFAULT_ID_COLUMN_NAME = 'ID';
const DEFAULT_QUESTION_COLUMN_INDEX_START = 6;
const DEFAULT_NAME_COLUMN_NAME = 'Name';
const DEFAULT_EMAIL_COLUMN_NAME = 'Email';
const DEFAULT_SUBMITTED_AT_COLUMN_NAME = 'Completion time';

export class Surveys extends SheetsConverter {
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

  protected config(ctx: StreamContext): SurveysConfig {
    return ctx.config.source_specific_configs?.sheets ?? {};
  }
  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const config = this.config(ctx);
    const sheetName = record?.record?.data?.sheetName;
    const row = record?.record?.data?.row;
    const questions = Object.keys(row).slice(
      config.question_column_index_start || DEFAULT_QUESTION_COLUMN_INDEX_START
    );
    const source = this.streamName.source;
    const res = [];

    const surveyUser = {
      uid: row[config.email_column_name || DEFAULT_EMAIL_COLUMN_NAME],
      email: row[config.email_column_name || DEFAULT_EMAIL_COLUMN_NAME],
      name: row[config.name_column_name || DEFAULT_NAME_COLUMN_NAME],
      source,
    };

    const surveyTeam = {
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

    const surveyQuestionRecs = this.getSurveyQuestionRecords(
      questions,
      sheetName,
      row,
      config,
      source,
      surveyUser,
      surveyTeam
    );
    res.push(...surveyQuestionRecs);
    return res;
  }

  private getSurveyQuestionRecords(
    questions: string[],
    sheetName: string,
    row: any,
    config: SurveysConfig,
    source: string,
    surveyUser: SurveyUser,
    surveyTeam: SurveyTeam
  ) {
    return questions.flatMap((question, index) => {
      const id = `${sheetName}-${
        row[config.id_column_name || DEFAULT_ID_COLUMN_NAME]
      }-${index}`;
      const surveyQuestionResponseKey = {
        uid: id,
        source,
      };
      const surveyRecord = {
        uid: sheetName,
        source,
        name: config.survey_name,
        description: config.survey_description,
        type: {
          category: config.survey_type,
          detail: config.survey_type,
        },
        status: {
          category: SurveyStatusCategory.InProgress,
          detail: SurveyStatusCategory.InProgress,
        }, // TODO: get status either from a column or from config
        // add startedAt, endedAt, and creator
      };
      const questionRecord = {
        uid: `${sheetName}-${index}`,
        question: question,
        description: '',
        questionCategory: {
          category: SurveyQuestionCategory.Custom, // TODO: get type from somewhere, either from an extra hidden field or from the column header
          detail: SurveyQuestionCategory.Custom,
        },
        responseType: {
          category: SurveyResponseCategory.Custom, // TODO: get response type similarly to question category
          detail: SurveyResponseCategory.Custom,
        },
        source: this.streamName.source,
      };
      const questionResponse = {
        model: 'survey_QuestionResponse',
        record: {
          ...surveyQuestionResponseKey,
          submittedAt:
            row[
              config.submitted_at_column_name ||
                DEFAULT_SUBMITTED_AT_COLUMN_NAME
            ],
          response: row[question],
          surveyQuestion: {
            survey: surveyRecord,
            question: questionRecord,
            order: index,
          },
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
          record: {
            survey: surveyRecord,
            question: questionRecord,
            order: index + 1,
          },
        },
      ];
    });
  }
}
