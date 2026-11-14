<template>
  <section class="route-page">
    <header class="page-head">
      <div>
        <div class="title-line">
          <h1>工作台</h1>
          <span v-if="studio.mode === 'demo'" class="sample-label">示例工作区</span>
        </div>
        <p>从一份内容开始，把每一次分享安排妥当。</p>
      </div>
      <el-button type="primary" size="large" @click="router.push('/publish-center')"
        ><el-icon><Plus /></el-icon>新建发布</el-button
      >
    </header>
    <div class="page-scroll dashboard-body">
      <div v-if="studio.connectionError && studio.mode === 'live'" class="notice">
        <el-icon><Warning /></el-icon><span>{{ studio.connectionError }}</span
        ><button class="text-button" @click="studio.refreshData()">重试连接</button>
      </div>
      <div class="overview">
        <div v-for="item in overview" :key="item.label">
          <span>{{ item.label }}</span><strong>{{ item.value }}</strong
          ><small>{{ item.hint }}</small>
        </div>
      </div>
      <section class="create-section">
        <div class="section-heading">
          <h2 class="section-title">今天，想分享点什么？</h2>
          <span class="text-muted">三种内容，一个工作区</span>
        </div>
        <div class="create-grid">
          <button
            v-for="kind in contentKinds"
            :key="kind.id"
            @click="router.push({ path: '/publish-center', query: { kind: kind.id } })"
          >
            <el-icon><component :is="kind.icon" /></el-icon>
            <div>
              <h3>发布{{ kind.label }}</h3>
              <p>
                {{
                  kind.id === 'video'
                    ? '一次准备，分发到多个视频平台'
                    : kind.id === 'note'
                      ? '把图片和文字整理成一份分享'
                      : '专注写作，预览正文与配图'
                }}
              </p>
            </div>
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>
      </section>
      <div class="dashboard-columns">
        <section>
          <div class="section-heading">
            <h2 class="section-title">继续创作</h2>
            <RouterLink class="text-button" to="/drafts"
              >全部草稿<el-icon><ArrowRight /></el-icon
            ></RouterLink>
          </div>
          <div v-if="studio.currentDrafts.length" class="data-list">
            <div v-for="draft in studio.currentDrafts.slice(0, 4)" :key="draft.id" class="data-row">
              <div class="row-main">
                <el-icon class="draft-icon"
                  ><component :is="contentKinds.find((kind) => kind.id === draft.kind)?.icon"
                /></el-icon>
                <div>
                  <h3>{{ draft.title || '未命名草稿' }}</h3>
                  <p>{{ kindLabel(draft.kind) }} · {{ formatTime(draft.updatedAt) }} 保存</p>
                </div>
              </div>
              <button
                class="text-button"
                @click="router.push({ path: '/publish-center', query: { draft: draft.id } })"
              >
                继续编辑
              </button>
            </div>
          </div>
          <div v-else class="dashboard-empty">
            <el-icon><EditPen /></el-icon>
            <h3>好内容，从一个想法开始</h3>
            <p>编辑中的内容会自动保存到草稿箱。</p>
            <button class="text-button" @click="router.push('/publish-center')">
              开始创作<el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </section>
        <section class="platform-overview">
          <div class="section-heading">
            <h2 class="section-title">我的发布账号</h2>
            <RouterLink class="text-button" to="/account-management">管理账号</RouterLink>
          </div>
          <div
            v-for="account in studio.accounts.slice(0, 5)"
            :key="account.id"
            class="account-overview-row"
          >
            <PlatformBadge :id="account.platformId" /><span
              ><strong>{{ account.name }}</strong
              ><small>{{ getPlatform(account.platformId)?.name }}</small></span
            ><span class="status-pill" :class="account.status"
              ><span
                class="status-dot"
                :class="account.status === 'valid' ? 'green' : 'amber'"
              ></span
              >{{ account.status === 'valid' ? '已登录' : '需登录' }}</span
            >
          </div>
          <p v-if="!studio.accounts.length" class="dialog-hint">
            添加账号后，即可在发布中心选择目标平台。
          </p>
          <div class="workspace-note">
            <el-icon><InfoFilled /></el-icon>
            <p>
              {{
                studio.mode === 'demo'
                  ? '示例工作区提供虚构账号与素材，所有队列操作都不会实际发布。'
                  : '账号和内容保留在本机。发布之前，可以先在任务中心检查目标与内容。'
              }}
            </p>
          </div>
        </section>
      </div>
      <section class="recent-materials">
        <div class="section-heading">
          <h2 class="section-title">最近的素材</h2>
          <RouterLink class="text-button" to="/material-management"
            >打开素材库<el-icon><ArrowRight /></el-icon
          ></RouterLink>
        </div>
        <div class="recent-material-grid">
          <button
            v-for="asset in studio.materials.slice(0, 3)"
            :key="asset.id"
            @click="router.push('/material-management')"
          >
            <img v-if="asset.sample && asset.kind !== 'article'" :src="asset.url" alt="" /><el-icon
              v-else
              ><component
                :is="
                  asset.kind === 'article'
                    ? 'Document'
                    : asset.kind === 'note'
                      ? 'Picture'
                      : 'VideoCamera'
                " /></el-icon
            ><span
              ><strong>{{ asset.name }}</strong
              ><small>{{ kindLabel(asset.kind) }} · {{ formatSize(asset.size) }}</small></span
            >
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStudioStore } from '@/stores/studio'
import { contentKinds, formatTime, getPlatform, kindLabel } from '@/config/platforms'
import { formatSize } from '@/utils/media'
import PlatformBadge from '@/components/PlatformBadge.vue'
const studio = useStudioStore(),
  router = useRouter()
const overview = computed(() => [
  {
    label: '发布账号',
    value: studio.accounts.length,
    hint: studio.accounts.filter((item) => item.status === 'valid').length + ' 个账号可用',
  },
  { label: '我的素材', value: studio.materials.length, hint: '视频、图片与文章' },
  { label: '创作草稿', value: studio.currentDrafts.length, hint: '随时继续编辑' },
  {
    label: '待处理任务',
    value: studio.pendingTaskCount,
    hint: studio.mode === 'demo' ? '演示队列' : '等待开始执行',
  },
])
</script>
<style scoped>
.dashboard-body {
  padding-top: 18px;
}
.overview {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin-bottom: 48px;
  padding: 10px 0 26px;
  border-bottom: 1px solid var(--stroke);
}
.overview > div {
  display: flex;
  flex-direction: column;
  padding-left: 28px;
  border-left: 1px solid var(--stroke);
}
.overview > div:first-child {
  padding-left: 0;
  border-left: 0;
}
.overview span {
  color: var(--secondary);
  font-size: 13px;
}
.overview strong {
  font-size: 34px;
  font-weight: 600;
  margin: 9px 0;
  font-variant-numeric: tabular-nums;
}
.overview small {
  font-size: 11px;
  color: var(--muted);
}
.create-section {
  margin-bottom: 42px;
}
.create-section .section-heading > span {
  font-size: 12px;
}
.create-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.create-grid > button {
  display: flex;
  align-items: center;
  padding: 23px 18px;
  gap: 14px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--stroke);
  border-radius: 9px;
}
.create-grid > button:hover {
  border-color: var(--accent);
  background: var(--surface-raised);
}
.create-grid > button > .el-icon:first-child {
  font-size: 26px;
  color: var(--accent);
}
.create-grid > button > .el-icon:last-child {
  margin-left: auto;
  color: var(--muted);
}
.create-grid h3 {
  font-size: 16px;
  font-weight: 550;
}
.create-grid p {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--muted);
}
.dashboard-columns {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 42px;
}
.platform-overview {
  border-left: 1px solid var(--stroke);
  padding-left: 32px;
}
.account-overview-row {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 13px 0;
  border-bottom: 1px solid var(--stroke);
}
.account-overview-row > span:not(.status-pill) {
  flex: 1;
}
.account-overview-row strong {
  display: block;
  font-size: 13px;
  font-weight: 500;
}
.account-overview-row small {
  display: block;
  font-size: 11px;
  margin-top: 3px;
  color: var(--muted);
}
.workspace-note {
  display: flex;
  gap: 9px;
  font-size: 11px;
  line-height: 1.8;
  color: var(--muted);
  margin-top: 20px;
}
.workspace-note .el-icon {
  margin-top: 4px;
  flex-shrink: 0;
}
.dashboard-empty {
  padding: 32px 0;
}
.dashboard-empty > .el-icon {
  font-size: 29px;
  color: var(--accent);
  margin-bottom: 15px;
}
.dashboard-empty h3 {
  font-weight: 500;
  font-size: 17px;
}
.dashboard-empty p {
  margin: 10px 0 12px;
  color: var(--muted);
  font-size: 12px;
}
.draft-icon {
  color: var(--accent);
  font-size: 25px;
}
.recent-materials {
  margin-top: 38px;
}
.recent-material-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.recent-material-grid button {
  display: flex;
  gap: 12px;
  text-align: left;
  padding: 12px 0;
}
.recent-material-grid img {
  width: 65px;
  height: 48px;
  object-fit: cover;
  border-radius: 5px;
}
.recent-material-grid .el-icon {
  font-size: 28px;
  padding: 8px;
  box-sizing: content-box;
  color: var(--accent);
}
.recent-material-grid strong {
  font-size: 12px;
  font-weight: 500;
}
.recent-material-grid small {
  display: block;
  margin-top: 7px;
  color: var(--muted);
  font-size: 10px;
}
@media (max-width: 1150px) {
  .create-grid {
    gap: 10px;
  }
  .create-grid > button {
    padding: 18px 12px;
    gap: 8px;
  }
  .create-grid > button > .el-icon:last-child {
    display: none;
  }
  .dashboard-columns {
    gap: 25px;
  }
  .platform-overview {
    padding-left: 25px;
  }
}
@media (max-width: 760px) {
  .create-grid,
  .dashboard-columns {
    grid-template-columns: 1fr;
  }
  .platform-overview {
    padding: 0;
    border-left: 0;
  }
  .overview {
    grid-template-columns: repeat(2, 1fr);
    row-gap: 25px;
  }
  .overview > div:nth-child(3) {
    border-left: 0;
    padding-left: 0;
  }
  .recent-material-grid {
    grid-template-columns: 1fr;
  }
}
</style>
