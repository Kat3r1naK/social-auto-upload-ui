<template>
  <section class="route-page">
    <header class="page-head">
      <div>
        <div class="title-line">
          <h1>草稿箱</h1>
          <span v-if="studio.mode === 'demo'" class="sample-label">示例工作区</span>
        </div>
        <p>保存每一个想法，在准备好时继续。</p>
      </div>
      <el-button type="primary" @click="router.push('/publish-center')"
        ><el-icon><Plus /></el-icon>新建内容</el-button
      >
    </header>
    <div class="page-scroll">
      <div class="toolbar">
        <el-input v-model="query" placeholder="搜索草稿标题" prefix-icon="Search" clearable />
      </div>
      <div class="filter-tabs">
        <button class="filter-tab" :class="{ active: kind === 'all' }" @click="kind = 'all'">
          全部草稿 <small>{{ studio.currentDrafts.length }}</small></button
        ><button
          v-for="item in contentKinds"
          :key="item.id"
          class="filter-tab"
          :class="{ active: kind === item.id }"
          @click="kind = item.id"
        >
          {{ item.label }}
        </button>
      </div>
      <div v-if="filtered.length" class="data-list">
        <div v-for="draft in filtered" :key="draft.id" class="data-row">
          <div class="row-main">
            <img
              v-if="draft.assets[0]?.sample && draft.assets[0]?.url"
              :src="draft.assets[0].url"
              alt=""
              class="thumbnail"
            /><el-icon v-else class="draft-icon"
              ><component :is="contentKinds.find((item) => item.id === draft.kind)?.icon"
            /></el-icon>
            <div>
              <h3>{{ draft.title || '未命名草稿' }}</h3>
              <p>
                {{ kindLabel(draft.kind) }} · {{ draft.selectedAccountIds.length }} 个目标账号 ·
                {{ formatTime(draft.updatedAt) }} 保存
              </p>
            </div>
          </div>
          <div class="row-actions">
            <button
              class="text-button"
              @click="router.push({ path: '/publish-center', query: { draft: draft.id } })"
            >
              继续编辑<el-icon><ArrowRight /></el-icon></button
            ><button
              class="icon-button"
              :aria-label="'删除草稿 ' + (draft.title || '未命名草稿')"
              @click="removeDraft(draft.id)"
            >
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <el-icon><Document /></el-icon>
        <h2>{{ query ? '没有找到这份草稿' : '把想法留在这里' }}</h2>
        <p>
          {{
            query ? '换一个关键词再找找。' : '发布中心会自动保存编辑中的内容，也可以随时手动保存。'
          }}
        </p>
        <el-button v-if="!query" type="primary" @click="router.push('/publish-center')"
          >开始创作</el-button
        >
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useStudioStore } from '@/stores/studio'
import { contentKinds, formatTime, kindLabel } from '@/config/platforms'
import type { ContentKind } from '@/types/studio'
const studio = useStudioStore(),
  router = useRouter(),
  query = ref(''),
  kind = ref<ContentKind | 'all'>('all')
const filtered = computed(() =>
  [...studio.currentDrafts]
    .filter(
      (item) =>
        (kind.value === 'all' || item.kind === kind.value) &&
        item.title.toLowerCase().includes(query.value.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt),
)
async function removeDraft(id: string) {
  try {
    await ElMessageBox.confirm('删除这份本地草稿？已经创建的任务不受影响。', '删除草稿', {
      confirmButtonText: '删除',
      cancelButtonText: '保留',
    })
    studio.drafts = studio.drafts.filter((item) => item.id !== id)
  } catch {
    /* User kept the draft. */
  }
}
</script>
<style scoped>
.draft-icon {
  color: var(--accent);
  font-size: 32px;
  width: 76px;
}
</style>
