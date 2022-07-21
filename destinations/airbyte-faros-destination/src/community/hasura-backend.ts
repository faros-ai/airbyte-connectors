import axios, {AxiosInstance} from 'axios';

import {GraphQLBackend} from '../common/graphql-client';

export class HasuraBackend implements GraphQLBackend {
  private readonly api: AxiosInstance;

  constructor(url: string, adminSecret?: string) {
    this.api = axios.create({
      baseURL: url,
      headers: {
        'X-Hasura-Role': 'admin',
        ...(adminSecret && {'X-Hasura-Admin-Secret': adminSecret}),
      },
    });
  }

  async healthCheck(): Promise<void> {
    await this.api.get('/healthz');
  }

  async postQuery(query: any): Promise<any> {
    return await this.api.post('/v1/graphql', {
      query: query,
    });
  }
}
