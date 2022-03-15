interface RequestMethod {
  (startIndex: number): Promise<any>;
}

export async function iterate<V>(
  requester: RequestMethod,
  dataExtractor: (data: any) => any,
  breaker: (item: any) => boolean,
  pageSize: number
): Promise<V[]> {
  const list: V[] = [];
  let startIndex = 0;
  let isContinueIteration = true;
  do {
    try {
      const res = await requester(startIndex);
      const data = dataExtractor(res);
      if (!data.length) {
        break;
      }
      for (const item of data) {
        if (breaker(item)) {
          isContinueIteration = false;
          break;
        }
        list.push(item);
      }
      startIndex += pageSize;
    } catch (ex: any) {
      console.log(list);
      throw ex;
    }
  } while (isContinueIteration);
  return list;
}
