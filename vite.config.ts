import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 端口固定 5180，strictPort 必须为 true。
 *
 * 浏览器的本地数据按「协议 + 域名 + 端口」隔离，任何一项变化都等于换了
 * 一个空数据库，用户会以为数据丢了。所以这里不允许自动换端口，
 * 也不允许改用 localhost（localhost 与 127.0.0.1 是不同来源）。
 */
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 这是个纯本地单页应用，全部资源从本机硬盘读，不做按页拆包；
    // 单文件 500 kB 的提示对本地场景没有意义，调高阈值免得每次都刷一条警告。
    chunkSizeWarningLimit: 900,
  },
})
