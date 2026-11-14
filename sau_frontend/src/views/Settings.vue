<template>
  <section class="route-page">
    <header class="page-head">
      <div>
        <h1>系统设置</h1>
        <p>让工作区适合你的创作习惯。</p>
      </div>
    </header>
    <div class="page-scroll settings-body">
      <section class="settings-section">
        <h2>工作区</h2>
        <div class="setting-row">
          <div>
            <h3>数据来源</h3>
            <p>
              {{
                studio.desktop
                  ? '使用本机真实账号、素材、草稿和发布任务。'
                  : '示例工作区与本机账号、草稿和任务分别保存。'
              }}
            </p>
          </div>
          <span v-if="studio.desktop" class="status-pill valid">本机工作区</span>
          <el-radio-group v-else :model-value="studio.mode" @change="changeMode"
            ><el-radio-button value="demo">示例工作区</el-radio-button
            ><el-radio-button value="live">本机工作区</el-radio-button></el-radio-group
          >
        </div>
        <div v-if="studio.mode === 'demo'" class="notice">
          <el-icon><InfoFilled /></el-icon
          ><span>示例工作区用于体验界面。所有账号为虚构示例，加入队列不会实际发布。</span>
        </div>
        <div v-else class="setting-row">
          <div>
            <h3>本地服务</h3>
            <p>
              {{
                studio.connection === 'connected'
                  ? studio.desktop
                    ? '已连接本机数据库和任务队列。'
                    : '已连接，可读取本机账号与素材。'
                  : '本地服务暂未连接，你仍可编辑和保存草稿。'
              }}
            </p>
          </div>
          <el-button :loading="studio.loading" @click="studio.refreshData()"
            ><el-icon><Refresh /></el-icon>重新检查</el-button
          >
        </div>
      </section>
      <section class="settings-section">
        <h2>外观</h2>
        <div class="setting-row">
          <div>
            <h3>界面主题</h3>
            <p>保留统一的紫色强调色，按环境切换明暗。</p>
          </div>
          <el-radio-group v-model="studio.theme"
            ><el-radio-button value="dark">深色</el-radio-button
            ><el-radio-button value="light">浅色</el-radio-button></el-radio-group
          >
        </div>
      </section>
      <section class="settings-section">
        <h2>本地内容</h2>
        <div class="setting-row">
          <div>
            <h3>导出草稿和任务</h3>
            <p>导出草稿正文和任务记录为 JSON。素材原文件与账号登录信息需单独备份。</p>
          </div>
          <el-button @click="exportWorkspace"
            ><el-icon><Download /></el-icon>导出内容</el-button
          >
        </div>
        <p class="settings-note">
          {{
            studio.desktop
              ? '账号、素材引用、草稿和任务存入本机 SQLite。导入文件保持原位置，移除素材不会删除原始文件；请避免移动正在使用的素材。'
              : '浏览器预览将草稿和任务保存在浏览器本地存储中。桌面客户端使用独立本机数据库。'
          }}
        </p>
      </section>
      <section v-if="studio.desktopInfo" class="settings-section">
        <h2>桌面客户端</h2>
        <div class="setting-row">
          <div>
            <h3>版本 {{ studio.desktopInfo.version }}</h3>
            <p>{{ studio.desktopInfo.workerMessage }}</p>
          </div>
          <span class="status-pill" :class="studio.desktopInfo.workerReady ? 'valid' : 'unknown'">{{
            studio.desktopInfo.workerReady ? '运行时已就绪' : '运行时待准备'
          }}</span>
        </div>
        <div class="setting-row">
          <div>
            <h3>数据目录</h3>
            <p>{{ studio.desktopInfo.dataDirectory }}</p>
          </div>
          <el-button @click="openDataDirectory">打开目录</el-button>
        </div>
        <div class="setting-row">
          <div>
            <h3>省内存模式</h3>
            <p>
              开启后，上传和账号检查依次执行；关闭时最多同时执行两项。正在执行的任务会继续完成。
            </p>
          </div>
          <el-switch
            :model-value="studio.desktopInfo.maxWorkers === 1"
            :loading="savingPerformance"
            aria-label="省内存模式"
            @change="setLowMemory"
          />
        </div>
        <p class="settings-note">
          关闭窗口后在托盘继续执行任务；一分钟后保存编辑内容并释放界面，再次打开时恢复。从托盘选择“退出”才会停止客户端。本地定时需要电脑保持运行。
        </p>
      </section>
      <section class="settings-section">
        <div class="section-heading">
          <h2>平台能力</h2>
          <span class="text-muted">17 个平台入口</span>
        </div>
        <p class="settings-note">
          下列为上传核心声明的内容能力。客户端会按平台逐项接入和验证，界面入口不代表已经完成真实发布联调。
        </p>
        <div class="capability-grid">
          <div v-for="platform in platforms" :key="platform.id">
            <PlatformBadge :id="platform.id" small /><strong>{{ platform.name }}</strong
            ><span>{{ platform.kinds.map(kindLabel).join(' · ') }}</span>
          </div>
        </div>
      </section>
      <section class="settings-section about-studio">
        <img src="/assets/sau-mark.png" alt="SAU Studio" />
        <div>
          <h2>SAU Studio</h2>
          <p>让创作专注，让分发有序。</p>
        </div>
      </section>
    </div>
  </section>
</template>
<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ref } from 'vue'
import { useStudioStore } from '@/stores/studio'
import { kindLabel, platforms } from '@/config/platforms'
import PlatformBadge from '@/components/PlatformBadge.vue'
const studio = useStudioStore()
const savingPerformance = ref(false)
async function setLowMemory(value: string | number | boolean) {
  savingPerformance.value = true
  try {
    await window.sauDesktop!.setMaxWorkers(value ? 1 : 2)
    await studio.refreshData()
  } catch (error) {
    ElMessage.error(String(error))
  } finally {
    savingPerformance.value = false
  }
}
async function openDataDirectory() {
  try {
    await window.sauDesktop!.openDataDirectory()
  } catch (error) {
    ElMessage.error(String(error))
  }
}
function changeMode(value: string | number | boolean | undefined) {
  if (value === 'demo' || value === 'live') {
    try {
      studio.setMode(value)
    } catch (error) {
      ElMessage.warning(error instanceof Error ? error.message : '工作区切换失败。')
    }
  }
}
async function exportWorkspace() {
  if (studio.desktop) {
    try {
      await studio.flushWorkspace()
      if (await window.sauDesktop!.exportContent('workspace'))
        ElMessage.success('草稿和完整任务记录已导出。')
    } catch (error) {
      ElMessage.error(String(error))
    }
    return
  }
  const data = {
    version: 1,
    mode: studio.mode,
    exportedAt: new Date().toISOString(),
    drafts: studio.currentDrafts,
    tasks: studio.currentTasks,
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'sau-studio-workspace.json'
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success('草稿和任务记录已导出。')
}
</script>
<style scoped>
.settings-body {
  max-width: 1140px;
}
.settings-section {
  padding: 16px 0 28px;
  border-bottom: 1px solid var(--stroke);
  margin-bottom: 20px;
}
.settings-section h2 {
  font-size: 17px;
  font-weight: 600;
}
.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 25px;
  padding: 24px 0 15px;
}
.setting-row h3 {
  font-size: 14px;
  font-weight: 500;
}
.setting-row > div:first-child {
  min-width: 0;
}
.setting-row > .el-button {
  flex-shrink: 0;
}
.setting-row p {
  color: var(--muted);
  line-height: 1.8;
  margin-top: 7px;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.setting-row > .el-radio-group {
  flex-shrink: 0;
}
.settings-note {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.9;
  margin-top: 12px;
}
.capability-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-top: 20px;
  gap: 0 20px;
}
.capability-grid > div {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 14px 0;
  border-bottom: 1px solid var(--stroke);
}
.capability-grid strong {
  font-size: 12px;
  font-weight: 500;
}
.capability-grid span {
  color: var(--muted);
  font-size: 10px;
  margin-left: auto;
}
.section-heading > span {
  font-size: 12px;
}
.about-studio {
  display: flex;
  gap: 20px;
  border-bottom: 0;
}
.about-studio > img {
  width: 48px;
  height: 48px;
}
.about-studio p {
  font-size: 12px;
  margin-top: 7px;
  color: var(--muted);
}
@media (max-width: 850px) {
  .setting-row {
    flex-wrap: wrap;
  }
  .capability-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 600px) {
  .capability-grid {
    grid-template-columns: 1fr;
  }
}
</style>
