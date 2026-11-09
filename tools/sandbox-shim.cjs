/**
 * 仅用于在受限沙箱环境里跑 Vite 时预加载（不影响你正常双击 构建.bat / 启动.bat）。
 *
 * 背景：Vite 在 Windows 上会调用 `net use` 探测网络映射盘，走 child_process 的
 * 管道通信；而当前沙箱禁止创建命名管道，会直接抛 spawn EPERM 导致构建失败。
 * 这里把 exec 变成一个安全失败的空实现，Vite 拿到 error 后会走默认分支，
 * 不影响正常的路径解析。
 *
 * 用法：node --require ./tools/sandbox-shim.cjs node_modules/vite/bin/vite.js build
 */
const cp = require('node:child_process')

const disabled = (name) =>
  function shim(...args) {
    const cb = [...args].reverse().find((a) => typeof a === 'function')
    if (cb) {
      process.nextTick(() =>
        cb(Object.assign(new Error(`sandbox: ${name} disabled`), { code: 'EPERM' }), '', ''),
      )
    }
    return { on() {}, once() {}, kill() {}, unref() {}, stdin: null, stdout: null, stderr: null }
  }

cp.exec = disabled('exec')
cp.execFile = disabled('execFile')
cp.spawn = disabled('spawn')
