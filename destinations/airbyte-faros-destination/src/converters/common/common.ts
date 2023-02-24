/** Common functions shared across converters */

export interface ComputeApplication {
  name: string;
  platform: string;
  uid: string;
}

export class Common {
  static computeApplication(
    name: string,
    platform?: string
  ): ComputeApplication {
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
    if (!platform) return name;
    return [name, platform].join('_');
  }
}
