export type Dict = Record<string, any>;

type PageInfo = {
  offset: number;
};

export type PaginationInfo = {
  next: PageInfo | null;
};

export type RequestResult = {
  builds: Dict[];
  '@pagination': PaginationInfo;
};

export interface RequestMethod {
  (params: RequestParams): Promise<RequestResult>;
}

export type RequestParams = {
  limit: number;
  offset?: number;
  [key: string]: any;
};

export async function* getIterator<T>(
  func: RequestMethod,
  deserializer: (item: Dict) => T,
  params: RequestParams,
  since: Date
): AsyncGenerator<T> {
  let offset: number | undefined = 0;

  do {
    try {
      const {builds, '@pagination': paginationInfo} = await func({
        ...params,
        offset,
      });
      for (const item of builds || []) {
        const updatedAt = new Date(item.updated_at);
        const finishedAt = new Date(item.finished_at);
        // We get builds sorted by desc order. Travis API however returns
        // builds without finished times e.g. errored builds first, filter
        // those out if we already saved them or updated before cutoff
        if (!finishedAt && updatedAt && since >= updatedAt) {
          continue;
        }
        if (finishedAt && since > finishedAt) {
          return null;
        }

        yield deserializer(item);
      }

      offset = paginationInfo.next?.offset;
    } catch (ex: any) {
      const message = `getIterator error: ${ex.message}`;
      throw ex;
    }
  } while (offset !== undefined);
}
