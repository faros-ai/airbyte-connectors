import {AirbyteLogLevel, AirbyteSourceLogger} from 'faros-airbyte-cdk';

export function sourceLogger(): AirbyteSourceLogger {
  return new AirbyteSourceLogger(AirbyteLogLevel.INFO);
}
