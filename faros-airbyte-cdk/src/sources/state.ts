import {Dictionary} from 'ts-essentials';
import VError from 'verror';
import zlib from 'zlib';

export interface CompressedState {
  format: string;
  data: string;
}

export class State {
  static compress(state: Dictionary<any, string>): CompressedState {
    const zipped = zlib.gzipSync(JSON.stringify(state)).toString('base64');
    return {format: 'base64/gzip', data: zipped};
  }

  static decompress(
    data?: Dictionary<any>
  ): Dictionary<any> | null | undefined {
    if (data?.format && data?.data) {
      switch (data.format) {
        case 'base64/gzip': {
          const unzipped = zlib.gunzipSync(Buffer.from(data.data, 'base64'));
          return JSON.parse(unzipped.toString());
        }
        default:
          throw new VError('Unsupported state format: %s', data.format);
      }
    }
    return data;
  }
}
