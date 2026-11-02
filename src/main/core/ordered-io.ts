/** Start independent reads ahead of the consumer, but publish results in input order.
 * On failure or cancellation, drain the reads already started before releasing their owner.
 */
export async function* orderedReads<T, R>(
  items: readonly T[],
  width: number,
  read: (item: T) => Promise<R>,
): AsyncGenerator<PromiseSettledResult<R>> {
  const pending = new Map<number, Promise<PromiseSettledResult<R>>>();
  const start = async (item: T): Promise<PromiseSettledResult<R>> => {
    try {
      return { status: 'fulfilled', value: await read(item) };
    } catch (reason) {
      return { status: 'rejected', reason };
    }
  };
  let next = 0;
  try {
    for (let index = 0; index < items.length; index++) {
      while (next < items.length && next < index + width) {
        pending.set(next, start(items[next]));
        next++;
      }
      const result = await pending.get(index)!;
      pending.delete(index);
      yield result;
    }
  } finally {
    await Promise.all(pending.values());
  }
}
