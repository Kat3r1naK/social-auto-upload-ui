<template>
  <div class="studio-window" :class="{ 'is-desktop': studio.desktop }">
    <DesktopTitlebar v-if="studio.desktop" />
    <div class="studio-shell">
      <aside class="studio-sidebar">
        <RouterLink class="brand" to="/" aria-label="SAU Studio 工作台"
          ><img src="/assets/sau-mark.png" alt="" class="brand-mark" /><span class="brand-copy"
            ><strong>SAU Studio</strong><small>多平台内容发布</small></span
          ></RouterLink
        >
        <nav class="main-nav" aria-label="主导航">
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="nav-link"
            :class="{ active: route.path === item.path }"
            :title="item.label"
            ><el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span
            ><span v-if="item.path === '/tasks' && studio.pendingTaskCount" class="nav-count">{{
              studio.pendingTaskCount
            }}</span></RouterLink
          >
        </nav>
        <div class="sidebar-bottom">
          <RouterLink
            to="/settings"
            class="nav-link"
            :class="{ active: route.path === '/settings' }"
            title="系统设置"
            ><el-icon><Setting /></el-icon><span>系统设置</span></RouterLink
          >
          <button
            class="nav-link"
            @click="studio.theme = studio.theme === 'dark' ? 'light' : 'dark'"
            :title="studio.theme === 'dark' ? '切换浅色主题' : '切换深色主题'"
            :aria-label="studio.theme === 'dark' ? '切换浅色主题' : '切换深色主题'"
          >
            <el-icon><component :is="studio.theme === 'dark' ? 'Moon' : 'Sunny'" /></el-icon
            ><span>主题切换</span>
          </button>
          <RouterLink
            class="workspace-indicator"
            to="/settings"
            :title="studio.mode === 'demo' ? '示例工作区，不会实际发布' : '本机工作区'"
            ><span
              class="status-dot"
              :class="
                studio.mode === 'demo'
                  ? 'purple'
                  : studio.connection === 'connected'
                    ? 'green'
                    : 'amber'
              "
            ></span
            ><span>{{ studio.mode === 'demo' ? '示例工作区' : '本机工作区' }}</span
            ><el-icon><ArrowRight /></el-icon
          ></RouterLink>
        </div>
      </aside>
      <main class="studio-main" id="main-content"><RouterView /></main>
      <div v-if="studio.storageError" class="storage-warning" role="alert">
        {{ studio.storageError }}
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useStudioStore } from '@/stores/studio'
import DesktopTitlebar from '@/components/DesktopTitlebar.vue'
const route = useRoute()
const studio = useStudioStore()
watch(
  () => studio.theme,
  (theme) => {
    if (studio.desktop) void window.sauDesktop!.setWindowTheme(theme).catch(() => {})
  },
  { immediate: true },
)
const navItems = [
  { path: '/', label: '工作台', icon: 'House' },
  { path: '/publish-center', label: '发布中心', icon: 'Promotion' },
  { path: '/drafts', label: '草稿箱', icon: 'Document' },
  { path: '/material-management', label: '素材库', icon: 'Picture' },
  { path: '/account-management', label: '账号管理', icon: 'User' },
  { path: '/tasks', label: '任务中心', icon: 'Files' },
  { path: '/history', label: '发布记录', icon: 'Clock' },
]
onMounted(() => {
  if (!studio.desktop && studio.mode === 'live') void studio.refreshData()
})
</script>
