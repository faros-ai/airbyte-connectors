import {Converter, StreamContext} from '../converter';

interface BigQueryConfig {
}

/** BigQuery converter base */
export abstract class BigQueryConverter extends Converter {
  source = 'BigQuery';


  protected bigqueryConfig(ctx: StreamContext): BigQueryConfig {
    return ctx.config?.source_specific_configs?.bigquery;
  }
}
