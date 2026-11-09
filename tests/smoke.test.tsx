import 'fake-indexeddb/auto'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const LABELS = [
  '首页总览',
  '今日计划',
  '自媒体',
  '开发工作',
  '咨询工作',
  '健身计划',
  '饮食计划',
  '游戏娱乐',
  '数据与设置',
]

let App: typeof import('../src/App').default

beforeAll(async () => {
  // 服务端渲染不需要真 DOM，但组件里读了 window / localStorage，
  // 这里给最小替身，避免为骨架测试引入 jsdom。
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
  vi.stubGlobal('window', {
    location: { origin: 'http://127.0.0.1:5180' },
    addEventListener: () => {},
    removeEventListener: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
  })
  vi.stubGlobal('document', {
    documentElement: { dataset: {}, style: {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    body: { style: {} },
  })
  App = (await import('../src/App')).default
})

function renderAt(path: string): string {
  return renderToString(
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(App)),
  )
}

function titleOf(html: string): string {
  const m = /<h1[^>]*>([^<]*)<\/h1>/.exec(html)
  return m?.[1] ?? ''
}

describe('M0/M1 骨架与路由', () => {
  it('侧边栏渲染出全部 9 个板块', () => {
    const html = renderAt('/')
    for (const label of LABELS) {
      expect(html, `缺少导航项：${label}`).toContain(label)
    }
  })

  it.each([
    ['/today', '今日计划'],
    ['/media', '自媒体'],
    ['/dev', '开发工作'],
    ['/consult', '咨询工作'],
    ['/fitness', '健身计划'],
    ['/diet', '饮食计划'],
    ['/game', '游戏娱乐'],
    ['/settings', '数据与设置'],
  ])('路由 %s 渲染页面标题 %s', (path, title) => {
    expect(titleOf(renderAt(path))).toBe(title)
  })

  it('首页渲染出今日计划与快速备忘两块', () => {
    const html = renderAt('/')
    expect(html).toContain('今日计划')
    expect(html).toContain('快速备忘')
    expect(html).toContain('记一笔')
  })

  it('导航链接与路由表一致（9 条，含首页）', () => {
    const hrefs = [...renderAt('/').matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(hrefs).toEqual([
      '/',
      '/today',
      '/media',
      '/dev',
      '/consult',
      '/fitness',
      '/diet',
      '/game',
      '/settings',
    ])
  })

  it('今日计划页渲染出添加任务的输入框', () => {
    expect(renderAt('/today')).toContain('添加任务，回车保存')
  })
})
