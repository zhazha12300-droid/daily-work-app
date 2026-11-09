#!/usr/bin/env node
/**
 * 本地静态服务器 —— 零依赖。
 *
 * 存在的原因：Chrome 在 file:// 下禁用 IndexedDB，所以不能直接双击 index.html，
 * 必须通过 http:// 打开。用户视角仍然是「双击 启动.bat」。
 *
 * 端口固定 5180，且不自动换端口：浏览器的本地数据按「协议 + 域名 + 端口」隔离，
 * 换端口等于换一个空数据库，看起来就像数据丢了。
 */
import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 5180
const HOST = '127.0.0.1'
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist')
const INDEX = join(ROOT, 'index.html')
const OPEN_BROWSER = !process.argv.includes('--no-open')
const URL_BASE = `http://${HOST}:${PORT}`

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

const log = (msg = '') => process.stdout.write(`${msg}\n`)

async function isFile(p) {
  try {
    return (await stat(p)).isFile()
  } catch {
    return false
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  res.end(body)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', URL_BASE)
    const pathname = decodeURIComponent(url.pathname)

    const rel = pathname.replace(/^\/+/, '')
    const candidate = resolve(ROOT, rel)

    // 防目录穿越
    if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) {
      send(res, 403, 'Forbidden')
      return
    }

    let filePath
    if (await isFile(candidate)) {
      filePath = candidate
    } else if (!extname(pathname)) {
      // 无扩展名 = 前端路由，回 index.html（刷新不 404）
      filePath = INDEX
    } else {
      send(res, 404, 'Not Found')
      return
    }

    const body = await readFile(filePath)
    const ext = extname(filePath).toLowerCase()
    const isHtml = ext === '.html'

    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      // 带 hash 的静态资源可以长缓存；入口 html 一律不缓存
      'Cache-Control': isHtml ? 'no-store' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch (err) {
    console.error(err)
    send(res, 500, 'Internal Error')
  }
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log()
    log(`✗ 端口 ${PORT} 已被占用。`)
    log('  这个端口是故意固定的：浏览器本地数据按「协议 + 域名 + 端口」隔离，')
    log('  换一个端口就等于换一个空数据库，看起来就像数据丢了。')
    log('  请先关掉占用 5180 的程序（很可能是另一个本应用窗口），再重试。')
    log()
    process.exit(1)
  }
  console.error(err)
  process.exit(1)
})

function openBrowser(url) {
  if (!OPEN_BROWSER) return
  const cmd =
    process.platform === 'win32'
      ? { file: 'cmd', args: ['/c', 'start', '', url] }
      : process.platform === 'darwin'
        ? { file: 'open', args: [url] }
        : { file: 'xdg-open', args: [url] }
  try {
    spawn(cmd.file, cmd.args, { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } catch {
    log(`  （自动打开浏览器失败，请手动访问 ${url}）`)
  }
}

if (!(await isFile(INDEX))) {
  log('✗ 还没有构建产物：dist/index.html 不存在。')
  log('  请先双击「构建.bat」，或运行 npm run build。')
  process.exit(1)
}

server.listen(PORT, HOST, () => {
  log()
  log(`  工作台已启动  ${URL_BASE}`)
  log('  关闭这个窗口即停止服务；数据保存在浏览器本地，不会随服务停止而消失。')
  log()
  openBrowser(URL_BASE)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 800)
  })
}
