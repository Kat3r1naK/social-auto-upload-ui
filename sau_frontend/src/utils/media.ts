import { http } from '@/utils/request'
import type { ContentKind, Material } from '@/types/studio'
export function formatSize(size: number): string {
  return size >= 1024 * 1024
    ? (size / 1024 / 1024).toFixed(size >= 100 * 1024 * 1024 ? 0 : 1) + ' MB'
    : (size / 1024).toFixed(1) + ' KB'
}
export function fileKind(file: File): ContentKind {
  if (/\.(md|markdown|txt|html?)$/i.test(file.name)) return 'article'
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)) return 'note'
  if (file.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.name))
    return 'video'
  throw new Error('请选择视频、图片或 Markdown / HTML / TXT 文章。')
}
export async function importMaterial(file: File, live: boolean): Promise<Material> {
  const kind = fileKind(file)
  if (live && window.sauDesktop) return window.sauDesktop.importFile(file)
  if (kind === 'article') {
    if (file.size > 5 * 1024 * 1024) throw new Error('文章文件过大，请选择小于 5 MB 的正文文件。')
    return {
      id: crypto.randomUUID(),
      name: file.name,
      kind,
      size: file.size,
      body: await file.text(),
      createdAt: new Date().toISOString(),
    }
  }
  if (live) {
    const data = new FormData()
    data.append('file', file)
    const result = await http.upload<{ filename: string; filepath: string }>('/uploadSave', data)
    return {
      id: crypto.randomUUID(),
      name: file.name,
      kind,
      size: file.size,
      serverPath: result.data.filepath,
      url:
        (import.meta.env.VITE_API_BASE_URL || '/api') +
        '/getFile?filename=' +
        encodeURIComponent(result.data.filepath),
      createdAt: new Date().toISOString(),
    }
  }
  return {
    id: crypto.randomUUID(),
    name: file.name,
    kind,
    size: file.size,
    url: URL.createObjectURL(file),
    createdAt: new Date().toISOString(),
  }
}
