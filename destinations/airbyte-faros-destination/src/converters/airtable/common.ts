import {createHash} from 'crypto';
import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';
import {
  QuestionCategoryMapping,
  SurveyCategory,
  SurveyQuestionCategory,
  SurveyQuestionCategoryType,
  SurveyResponseCategory,
  SurveyResponseType,
  SurveyType,
} from './models';

export abstract class AirtableConverter extends Converter {
  source = 'Airtable';
  id(record: AirbyteRecord): any {
    return record?.record?.data?._airtable_id;
  }

  static getQuestionCategory(
    category: string,
    questionCategoryMapping: QuestionCategoryMapping = {}
  ): SurveyQuestionCategoryType {
    const farosCategory = SurveyQuestionCategory[category];
    if (farosCategory) {
      return {
        category: farosCategory,
        detail: category,
      };
    }

    const mappedCategory = questionCategoryMapping[category];
    // Check if category was mapped to a Faros category
    const farosMappedCategory = SurveyQuestionCategory[mappedCategory];
    if (farosMappedCategory) {
      return {
        category: farosMappedCategory,
        detail: category,
      };
    }

    return {
      category: SurveyQuestionCategory.Custom,
      detail: category,
    };
  }

  static getSurveyType(type: string): SurveyType {
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
    };
  }

  static getResponseType(category: string): SurveyResponseType {
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
    };
  }

  static getTeamUidFromTeamName(teamName: string): string {
    return teamName.toLowerCase().split(' ').join('_');
  }

  static getSurveyId(fqTableId: string): string {
    // Get the first part of the fully qualified table id, which corresponds to the Airtable base id
    // E.g., appwVNmuUAPCIxzSZ/tblWFFSCLxi0gVtkU -> appwVNmuUAPCIxzSZ
    return fqTableId.split('/')[0];
  }

  static createQuestionUid(question: string, surveyId: string) {
    return `${surveyId}-${createHash('sha256').update(question).digest('hex')}`;
  }
}
