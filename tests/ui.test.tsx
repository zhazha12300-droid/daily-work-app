// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../src/components/Toast'
import { db } from '../src/db'
import { todayStr } from '../src/lib/date'
import DevPage from '../src/pages/DevPage'
import GamePage from '../src/pages/GamePage'
import MediaPage from '../src/pages/MediaPage'
import SettingsPage from '../src/pages/SettingsPage'
import { addItem, addProject } from '../src/repo/dev'
import { addMedia, patchMedia } from '../src/repo/media'
import { ensureSettings } from '../src/repo/settings'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSettings()
})

afterEach(() => {
  cleanup()
})

describe('游戏娱乐：添加游戏', () => {
  it('输入名字点「＋ 游戏」，游戏出现在库里且落库', async () => {
    render(
      <ToastProvider>
        <GamePage />
      </ToastProvider>,
    )

    const input = screen.getByPlaceholderText(/游戏名字/)
    fireEvent.change(input, { target: { value: '塞尔达传说' } })
    fireEvent.click(screen.getByRole('button', { name: /＋ 游戏/ }))

    await screen.findByText('塞尔达传说')
    await waitFor(async () => {
      expect(await db.games.count()).toBe(1)
    })
  })

  it('添加失败时把原因用 toast 亮出来，而不是静默吞掉', async () => {
    const spy = vi.spyOn(db.games, 'add').mockRejectedValue(new Error('存储不可用'))
    try {
      render(
        <ToastProvider>
          <GamePage />
        </ToastProvider>,
      )
      fireEvent.change(screen.getByPlaceholderText(/游戏名字/), {
        target: { value: '塞尔达传说' },
      })
      fireEvent.click(screen.getByRole('button', { name: /＋ 游戏/ }))

      await screen.findByText(/添加失败：存储不可用/)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('自媒体：添加新选题', () => {
  it('输入标题点「＋ 新选题」，选题出现在想法里且落库', async () => {
    render(
      <ToastProvider>
        <MediaPage />
      </ToastProvider>,
    )

    const input = screen.getByPlaceholderText(/冒出一个想法/)
    fireEvent.change(input, { target: { value: '本地优先笔记' } })
    fireEvent.click(screen.getByRole('button', { name: /＋ 新选题/ }))

    const matches = await screen.findAllByText('本地优先笔记')
    expect(matches.length).toBeGreaterThan(0)
    await waitFor(async () => {
      expect(await db.mediaItems.count()).toBe(1)
    })
  })

  it('添加失败时把原因用 toast 亮出来', async () => {
    const spy = vi.spyOn(db.mediaItems, 'add').mockRejectedValue(new Error('存储不可用'))
    try {
      render(
        <ToastProvider>
          <MediaPage />
        </ToastProvider>,
      )
      fireEvent.change(screen.getByPlaceholderText(/冒出一个想法/), {
        target: { value: '本地优先笔记' },
      })
      fireEvent.click(screen.getByRole('button', { name: /＋ 新选题/ }))

      await screen.findByText(/添加失败：存储不可用/)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('开发工作：新建项目不覆盖旧项目', () => {
  it('已有项目时新建项目，旧任务仍可见，新项目出现在列表', async () => {
    const oldId = await addProject('老项目')
    await addItem({ projectId: oldId, type: 'task', title: '老任务' })

    render(
      <ToastProvider>
        <DevPage />
      </ToastProvider>,
    )

    // 初始默认选中老项目，任务可见
    await screen.findByText('老任务')

    fireEvent.click(screen.getByRole('button', { name: /＋ 新项目/ }))

    // 修复点：旧任务仍然可见，没有被新建项目顶掉
    await screen.findByText('老任务')
    // 新项目出现在左侧项目列表
    await screen.findByText('新项目')

    // 数据层确认：老项目的条目原样保留，新项目是独立的新记录
    const oldItems = await db.devItems.where('projectId').equals(oldId).toArray()
    expect(oldItems.map((i) => i.title)).toEqual(['老任务'])
    expect(await db.devProjects.count()).toBe(2)
  })
})

describe('数据与设置：偏好行排版', () => {
  it('「每周从哪天开始」的说明文字与下拉都在，切换后落库', async () => {
    render(
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>,
    )

    // 标签和那句说明都要能正常渲染成文本（之前被控件挤成一列竖排）
    expect(await screen.findByText('每周从哪天开始')).toBeTruthy()
    expect(screen.getByText('影响「本周完成率」和所有按周汇总的统计。')).toBeTruthy()

    // 找到「周一 / 周日」这个下拉，并改选周日
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    const weekSelect = selects.find((el) =>
      [...el.options].some((o) => o.value === '0' && o.text === '周日'),
    )
    expect(weekSelect).toBeTruthy()

    fireEvent.change(weekSelect!, { target: { value: '0' } })

    await waitFor(async () => {
      expect((await db.settings.get('app'))?.weekStart).toBe(0)
    })
  })
})

describe('自媒体：发布后数据图表', () => {
  it('切到「数据图表」能看到柱状图、汇总数字和月份轴', async () => {
    const id = await addMedia({ title: '爆款视频', status: 'published' })
    await patchMedia(id, { publishDate: todayStr(), views: 1234 })

    render(
      <ToastProvider>
        <MediaPage />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '数据图表' }))

    expect(await screen.findByText(/近 6 个月发布与浏览/)).toBeTruthy()
    // 等 liveQuery 把统计算出来：总浏览 = 1234，柱子上方也标 1234
    const nums = await screen.findAllByText('1234')
    expect(nums.length).toBeGreaterThan(0)
    expect(screen.getByText(/平均/)).toBeTruthy()
    // 图表本体（无障碍角色）在
    expect(screen.getByRole('img', { name: /柱状图/ })).toBeTruthy()
  })
})
