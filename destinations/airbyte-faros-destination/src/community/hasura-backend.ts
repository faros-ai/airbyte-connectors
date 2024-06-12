import axios, {AxiosInstance} from 'axios';

import {GraphQLBackend} from '../common/graphql-client';
import {HttpAgents} from '../destination';

export class HasuraBackend implements GraphQLBackend {
  private readonly api: AxiosInstance;

  constructor(url: string, adminSecret?: string, httpAgents?: HttpAgents) {
    this.api = axios.create({
      ...httpAgents,
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

  async postQuery(query: any, variables?: any): Promise<any> {
    // extract and return the data field of axios response
    const {data} = await this.api.post('/v1/graphql', {
      query,
      variables,
    });
    return data;
  }
}
