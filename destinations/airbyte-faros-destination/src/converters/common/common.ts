import {toLower} from 'lodash';

/** Common functions shared across converters */
export class Common {
  static computeApplication(
    name: string,
    platform?: string
  ): {name: string; platform?: string; uid: string} {
    return {
      name,
      platform: platform ?? '',
      uid: Common.computeApplicationUid(name, platform),
    };
  }

  private static computeApplicationUid(
    name: string,
    platform?: string
  ): string {
    if (!platform) return toLower(name);
    return [toLower(name), toLower(platform)].join('_');
  }
}
