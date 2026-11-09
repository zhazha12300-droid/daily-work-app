export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // 极老的浏览器兜底（正常用不到）
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
