let last = 0

/**
 * 单调递增的时间戳。
 *
 * 同一毫秒里连续创建的两条记录，Date.now() 会给出相同的值，
 * IndexedDB 的返回顺序就成了随机的（按主键），列表会来回跳。
 * 这里保证后创建的记录一定更大，连续敲几条任务顺序才稳定。
 */
export function nextTimestamp(): number {
  const now = Date.now()
  last = now > last ? now : last + 1
  return last
}
