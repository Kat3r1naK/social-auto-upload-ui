<template>
  <section class="route-page">
    <header class="page-head">
      <div>
        <div class="title-line">
          <h1>素材库</h1>
          <span v-if="studio.mode === 'demo'" class="sample-label">示例工作区</span>
        </div>
        <p>让视频、图片和文字，都在需要时触手可及。</p>
      </div>
      <div class="head-actions">
        <el-button
          v-if="studio.mode === 'live'"
          :loading="studio.loading"
          @click="studio.refreshData()"
          ><el-icon><Refresh /></el-icon>刷新</el-button
        ><el-button type="primary" :loading="importing" @click="fileInput?.click()"
          ><el-icon><Upload /></el-icon>导入素材</el-button
        >
      </div>
    </header>
    <div class="page-scroll" @dragover.prevent @drop.prevent="handleDrop">
      <div v-if="studio.connectionError && studio.mode === 'live'" class="notice">
        <el-icon><Warning /></el-icon><span>{{ studio.connectionError }}</span>
      </div>
      <div class="toolbar">
        <el-input v-model="query" placeholder="搜索素材名称" prefix-icon="Search" clearable /><span
          class="material-count"
          >共 {{ filtered.length }} 份素材</span
        >
        <div class="view-toggle" aria-label="素材显示方式">
          <button :class="{ active: view === 'grid' }" aria-label="网格视图" @click="view = 'grid'">
            <el-icon><Grid /></el-icon></button
          ><button
            :class="{ active: view === 'list' }"
            aria-label="列表视图"
            @click="view = 'list'"
          >
            <el-icon><List /></el-icon>
          </button>
        </div>
      </div>
      <div class="filter-tabs">
        <button class="filter-tab" :class="{ active: kind === 'all' }" @click="kind = 'all'">
          全部素材</button
        ><button
          v-for="item in contentKinds"
          :key="item.id"
          class="filter-tab"
          :class="{ active: kind === item.id }"
          @click="kind = item.id"
        >
          {{ item.label
          }}<small>{{ studio.materials.filter((asset) => asset.kind === item.id).length }}</small>
        </button>
      </div>
      <div v-if="filtered.length" class="materials" :class="view">
        <article v-for="asset in pagedMaterials" :key="asset.id" class="material-card">
          <button
            class="material-visual"
            :aria-label="'预览 ' + asset.name"
            @click="previewAsset(asset)"
          >
            <img
              v-if="asset.url && (asset.sample || asset.kind === 'note')"
              :src="asset.url"
              :alt="asset.name"
              loading="lazy"
              decoding="async"
            /><video
              v-else-if="asset.url && asset.kind === 'video'"
              :src="asset.url"
              preload="none"
            /><el-icon v-else
              ><component
                :is="
                  asset.kind === 'article'
                    ? 'Document'
                    : asset.kind === 'note'
                      ? 'Picture'
                      : 'VideoCamera'
                " /></el-icon
            ><span class="material-kind">{{ kindLabel(asset.kind) }}</span
            ><span v-if="asset.duration" class="duration">{{ asset.duration }}</span>
          </button>
          <div class="material-copy">
            <h2>{{ asset.name }}</h2>
            <p>
              {{ formatSize(asset.size) }}<span v-if="asset.sample"> · 示例素材</span
              ><span v-else-if="!asset.url && asset.kind !== 'article'"> · 需重新选择文件</span>
            </p>
          </div>
          <div class="material-actions">
            <button class="text-button" @click="useAsset(asset)">
              用于发布<el-icon><ArrowRight /></el-icon></button
            ><button
              class="icon-button"
              :aria-label="'删除素材 ' + asset.name"
              @click="removeAsset(asset)"
            >
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">
        <el-icon><FolderOpened /></el-icon>
        <h2>{{ query ? '没有找到这份素材' : '为下一次创作，准备一点素材' }}</h2>
        <p>拖入文件，或点击导入。支持视频、图片和 Markdown / HTML / TXT 正文。</p>
        <el-button type="primary" @click="fileInput?.click()">导入第一份素材</el-button>
      </div>
      <el-pagination
        v-if="filtered.length > pageSize"
        v-model:current-page="page"
        class="list-pagination"
        :page-size="pageSize"
        :total="filtered.length"
        layout="prev, pager, next"
        aria-label="素材分页"
      />
      <p class="material-footnote">
        {{
          studio.mode === 'demo'
            ? '示例工作区导入的文件仅在本次浏览会话中预览；文件信息会保留，刷新后可重新选择。'
            : '素材保存到本机服务，由当前工作区读取。'
        }}
      </p>
    </div>
    <input
      ref="fileInput"
      class="hidden-input"
      type="file"
      multiple
      accept="video/*,image/*,.mkv,.md,.markdown,.html,.htm,.txt"
      @change="handleFiles"
    /><el-dialog
      :model-value="Boolean(selectedAsset)"
      :title="selectedAsset?.name || '素材预览'"
      width="800px"
      @update:model-value="selectedAsset = undefined"
      ><template v-if="selectedAsset"
        ><img
          v-if="selectedAsset.url && (selectedAsset.sample || selectedAsset.kind === 'note')"
          class="asset-preview"
          :src="selectedAsset.url"
          :alt="selectedAsset.name"
        /><video
          v-else-if="selectedAsset.url"
          class="asset-preview"
          :src="selectedAsset.url"
          controls
        />
        <pre v-else-if="selectedAsset.kind === 'article'" class="article-source">{{
          selectedAsset.body
        }}</pre>
        <div v-else class="empty-state">
          <el-icon><FolderOpened /></el-icon>
          <h2>请重新选择本地文件</h2>
          <p>文件信息已保存，本地预览需要重新导入。</p>
          <el-button @click="fileInput?.click()">重新选择</el-button>
        </div>
        <p v-if="selectedAsset.sample" class="dialog-hint">
          示例封面仅用于体验预览和素材选择流程。
        </p></template
      ></el-dialog
    >
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { contentKinds, kindLabel } from '@/config/platforms'
import { createComposer, useStudioStore } from '@/stores/studio'
import { formatSize, importMaterial } from '@/utils/media'
import { http } from '@/utils/request'
import type { ContentKind, Material } from '@/types/studio'
const studio = useStudioStore(),
  router = useRouter(),
  query = ref(''),
  kind = ref<ContentKind | 'all'>('all'),
  view = ref<'grid' | 'list'>('grid'),
  selectedAsset = ref<Material>(),
  importing = ref(false),
  fileInput = ref<HTMLInputElement>()
let previewRequest = 0
onBeforeUnmount(() => {
  previewRequest++
})
async function fullAsset(asset: Material) {
  return studio.desktop && asset.kind === 'article'
    ? window.sauDesktop!.materialDetail(String(asset.id))
    : asset
}
async function previewAsset(asset: Material) {
  const request = ++previewRequest
  try {
    const detail = await fullAsset(asset)
    if (request === previewRequest) selectedAsset.value = detail
  } catch (error) {
    ElMessage.error(String(error))
  }
}
const filtered = computed(() =>
  studio.materials.filter(
    (asset) =>
      (kind.value === 'all' || asset.kind === kind.value) &&
      asset.name.toLowerCase().includes(query.value.toLowerCase()),
  ),
)
const page = ref(1),
  pageSize = 24
const pagedMaterials = computed(() =>
  filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)
watch([query, kind], () => {
  page.value = 1
})
watch(
  () => filtered.value.length,
  (count) => {
    page.value = Math.min(page.value, Math.max(1, Math.ceil(count / pageSize)))
  },
)
async function addFiles(files: File[]) {
  if (importing.value || !files.length) return
  importing.value = true
  let added = 0
  try {
    for (const file of files) {
      const asset = await importMaterial(file, studio.mode === 'live')
      if (studio.mode === 'demo') studio.sampleMaterials.unshift(asset)
      else if (asset.kind === 'article' && !studio.desktop) {
        const form = createComposer('article', false)
        form.title = asset.name.replace(/\.[^.]+$/, '')
        form.body = asset.body || ''
        studio.saveDraft(form)
      }
      added++
    }
    if (studio.mode === 'live') await studio.refreshData()
    ElMessage.success(
      '已导入 ' +
        added +
        ' 份素材' +
        (studio.mode === 'live' && !studio.desktop ? '，文章保存在草稿箱。' : '。'),
    )
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '素材导入失败。')
  } finally {
    importing.value = false
  }
}
async function handleFiles(event: Event) {
  const input = event.target as HTMLInputElement
  await addFiles(Array.from(input.files || []))
  input.value = ''
}
function handleDrop(event: DragEvent) {
  void addFiles(Array.from(event.dataTransfer?.files || []))
}
async function useAsset(asset: Material) {
  try {
    asset = await fullAsset(asset)
  } catch (error) {
    ElMessage.error(String(error))
    return
  }
  const form = createComposer(asset.kind, false)
  if (asset.kind === 'article') {
    form.body = asset.body || ''
    form.articleBasePath = asset.localPath
    form.title = asset.name.replace(/\.[^.]+$/, '')
  } else form.assets = [asset]
  const id = studio.saveDraft(form)
  void router.push({ path: '/publish-center', query: { draft: id } })
}
async function removeAsset(asset: Material) {
  try {
    await ElMessageBox.confirm(
      '从素材库移除「' +
        asset.name +
        '」？' +
        (studio.desktop ? '原始文件将保留。' : '本机工作区中对应的素材文件也会删除。'),
      '删除素材',
      { confirmButtonText: '删除', cancelButtonText: '保留' },
    )
    if (studio.mode === 'demo')
      studio.sampleMaterials = studio.sampleMaterials.filter((item) => item.id !== asset.id)
    else {
      if (studio.desktop) await window.sauDesktop!.removeMaterial(String(asset.id))
      else await http.get('/deleteFile', { id: asset.id })
      await studio.refreshData()
    }
  } catch (error) {
    if (studio.desktop && error !== 'cancel' && error !== 'close') ElMessage.error(String(error))
  }
}
</script>
<style scoped>
.material-count {
  margin-left: auto;
  color: var(--muted);
  font-size: 12px;
}
.view-toggle {
  display: flex;
  border: 1px solid var(--stroke);
  border-radius: 7px;
  padding: 3px;
}
.view-toggle button {
  padding: 5px 8px;
  color: var(--muted);
  display: flex;
  border-radius: 4px;
  font-size: 17px;
}
.view-toggle button.active {
  color: var(--accent);
  background: var(--accent-soft);
}
.materials.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(245px, 1fr));
  gap: 23px;
}
.material-card {
  background: var(--surface);
  border: 1px solid var(--stroke);
  border-radius: 10px;
  overflow: hidden;
}
.material-visual {
  width: 100%;
  aspect-ratio: 1.65;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-raised);
}
.material-visual > img,
.material-visual > video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.material-visual > .el-icon {
  font-size: 44px;
  color: var(--accent);
}
.material-kind,
.duration {
  position: absolute;
  background: rgba(12, 10, 25, 0.7);
  color: #fff;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 10px;
}
.material-kind {
  top: 10px;
  left: 10px;
}
.duration {
  bottom: 9px;
  right: 10px;
}
.material-copy {
  padding: 17px 17px 10px;
}
.material-copy h2 {
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}
.material-copy p {
  font-size: 11px;
  color: var(--muted);
  margin-top: 8px;
}
.material-actions {
  padding: 0 12px 12px 17px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.material-actions .text-button {
  font-size: 12px;
}
.materials.list .material-card {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
.materials.list .material-visual {
  width: 120px;
  height: 80px;
  flex-shrink: 0;
}
.materials.list .material-copy {
  flex: 1;
  min-width: 0;
  padding: 15px;
}
.materials.list .material-actions {
  gap: 20px;
  padding: 0 12px;
}
.hidden-input {
  display: none;
}
.asset-preview {
  width: 100%;
  max-height: 65vh;
  object-fit: contain;
  margin-bottom: 15px;
}
.article-source {
  white-space: pre-wrap;
  line-height: 1.9;
  font-family: inherit;
  color: var(--secondary);
  max-height: 60vh;
  overflow-y: auto;
}
.material-footnote {
  color: var(--muted);
  margin-top: 26px;
  font-size: 11px;
  line-height: 1.8;
}
@media (max-width: 650px) {
  .materials.list .material-visual {
    width: 65px;
    height: 70px;
  }
  .materials.list .material-kind {
    display: none;
  }
  .materials.list .material-actions {
    gap: 6px;
  }
  .materials.list .material-actions .text-button {
    font-size: 10px;
  }
  .material-count {
    margin-left: 0;
  }
}
</style>
