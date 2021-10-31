import {AirbyteConfig} from 'faros-airbyte-cdk/lib';
import {VError} from 'verror';

export function genAuthorizationHeader(
  config: AirbyteConfig
): Record<string, string> {
  if (!config.app_api_key) {
    throw new VError('Expected config to have app_api_key defined');
  }

  return {
    Authorization: `Bearer ${config.app_api_key}`,
  };
}
