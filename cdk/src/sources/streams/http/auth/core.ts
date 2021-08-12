import {Dictionary} from 'ts-essentials';

/**
 * Base abstract class for various HTTP Authentication strategies.
 * Authentication strategies are generally expected to provide security
 * credentials via HTTP headers.
 */
export abstract class HttpAuthenticator {
  /**
   * @returns A dictionary containing all the necessary headers to authenticate.
   */
  abstract getAuthHeader(): Promise<Dictionary<any>>;
}

export class NoAuth extends HttpAuthenticator {
  async getAuthHeader(): Promise<Dictionary<any>> {
    return {};
  }
}
