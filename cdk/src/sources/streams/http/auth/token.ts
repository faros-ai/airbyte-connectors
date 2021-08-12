import {Dictionary} from 'ts-essentials';

import {HttpAuthenticator} from './core';

export class TokenAuthenticator extends HttpAuthenticator {
  constructor(
    private readonly token: string,
    private readonly authMethod: string = 'Bearer',
    private readonly authHeader: string = 'Authorization'
  ) {
    super();
  }

  async getAuthHeader(): Promise<Dictionary<any>> {
    return {
      [this.authHeader]: `${this.authMethod} ${this.token}`,
    };
  }
}
