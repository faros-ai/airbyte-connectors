/* eslint-disable @typescript-eslint/no-var-requires */

import Client from '@atlassian/bitbucket-server';

const ROUTES = require('../../resources/more-routes.json');

const endpointMethod = require('@atlassian/bitbucket-server/src/plugins/endpoint-methods/method');
const getParamGroups = require('@atlassian/bitbucket-server/src/plugins/endpoint-methods/get-param-groups');

export const Prefix = '__faros__';

// Adapted from @atlassian/bitbucket-server/src/plugins/endpoint-methods/index
export class MoreEndpointMethodsPlugin {
  constructor(private readonly core: Client) {}

  inject(): void {
    this.core[Prefix] = {};
    Object.keys(ROUTES).forEach((namespaceName) => {
      this.core[Prefix][namespaceName] = {};

      Object.keys(ROUTES[namespaceName]).forEach((apiName) => {
        let apiOptions = ROUTES[namespaceName][apiName];

        if (apiOptions.alias) {
          const [namespaceAlias, apiAlias] = apiOptions.alias.split('.');
          apiOptions = ROUTES[namespaceAlias][apiAlias];
        }

        const {accepts, method, params: paramsSpecs, url, ...rest} = apiOptions;
        const _paramGroups = getParamGroups(paramsSpecs);
        const defaults = {method, url, ...rest, _paramGroups};
        if (accepts) defaults.accepts = accepts;

        this.core[Prefix][namespaceName][apiName] = endpointMethod.bind(
          null,
          this.core,
          defaults,
          paramsSpecs
        );
      });
    });
  }
}
