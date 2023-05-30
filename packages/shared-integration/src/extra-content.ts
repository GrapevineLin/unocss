import fs from 'node:fs/promises'
import { resolve } from 'node:path'
import fg from 'fast-glob'
import type { UnocssPluginContext } from '@unocss/core'
import { applyTransformers } from './transformers'

export async function extractFile(file: string, ctx: UnocssPluginContext) {
  await ctx.getConfig()
  const { extract, filter } = ctx
  const code = await fs.readFile(file, 'utf-8')
  if (!filter(code, file))
    return
  const preTransform = await applyTransformers(ctx, code, file, 'pre')
  const defaultTransform = await applyTransformers(ctx, preTransform?.code || code, file)
  await applyTransformers(ctx, defaultTransform?.code || preTransform?.code || code, file, 'post')
  return await extract(preTransform?.code || code, file)
}

export async function setupExtraContent(ctx: UnocssPluginContext, shouldWatch = false) {
  const { extraContent } = await ctx.getConfig()
  const { extract, tasks, root } = ctx

  // plain text
  if (extraContent?.plain) {
    await Promise.all(
      extraContent.plain.map((code, idx) => {
        return extract(code, `__extra_content_${idx}__`)
      }),
    )
  }

  // filesystem
  if (extraContent?.filesystem) {
    const files = await fg(extraContent.filesystem, { cwd: root })

    async function _extractFile(file: string) {
      return extractFile(file, ctx)
    }

    if (shouldWatch) {
      const { watch } = await import('chokidar')
      const ignored = ['**/{.git,node_modules}/**']

      const watcher = watch(files, {
        ignorePermissionErrors: true,
        ignored,
        cwd: root,
        ignoreInitial: true,
      })

      watcher.on('all', (type, file) => {
        if (type === 'add' || type === 'change') {
          const absolutePath = resolve(root, file)
          tasks.push(_extractFile(absolutePath))
        }
      })
    }

    await Promise.all(files.map(_extractFile))
  }
}
