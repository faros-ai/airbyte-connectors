import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';
import {
  QuestionCategoryMapping,
  SurveyQuestionCategory,
  SurveyQuestionCategoryType,
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
}
