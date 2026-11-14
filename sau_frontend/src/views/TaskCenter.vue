<template>
  <section class="route-page">
    <header class="page-head">
      <div>
        <div class="title-line">
          <h1>{{ history ? '发布记录' : '任务中心' }}</h1>
          <span v-if="studio.mode === 'demo'" class="sample-label">示例工作区</span>
        </div>
        <p>
          {{
            history
              ? '按账号查看每次提交的结果，保留清晰的发布轨迹。'
              : '每个目标账号都是独立任务，进度与结果分别记录。'
          }}
        </p>
      </div>
      <div class="head-actions">
        <el-button v-if="total" @click="exportTasks"
          ><el-icon><Download /></el-icon>导出记录</el-button
        ><el-button type="primary" @click="router.push('/publish-center')"
          ><el-icon><Plus /></el-icon>新建发布</el-button
        >
      </div>
    </header>
    <div class="page-scroll">
      <div v-if="listError" class="notice">
        <span>{{ listError }}</span
        ><button class="text-button" @click="studio.refreshData()">重试</button>
      </div>
      <div v-if="studio.mode === 'demo'" class="notice">
        <el-icon><InfoFilled /></el-icon
        ><span>这是演示队列。任务只保存在当前工作区，不会上传或向平台发布内容。</span>
      </div>
      <div class="toolbar">
        <el-input
          v-model="query"
          placeholder="搜索内容、账号或平台"
          prefix-icon="Search"
          clearable
        /><el-select v-model="status" placeholder="全部状态" style="width: 170px"
          ><el-option label="全部状态" value="all" /><el-option
            v-for="(label, value) in labels"
            :key="value"
            :label="label"
            :value="value" /></el-select
        ><span class="text-muted task-total">共 {{ total }} 个任务</span>
      </div>
      <div v-if="total" class="data-list">
        <div v-for="task in pagedTasks" :key="task.id" class="task-row">
          <div class="task-content">
            <PlatformBadge :id="task.account.platformId" />
            <div>
              <h3>{{ task.title }}</h3>
              <p>
                {{ getPlatform(task.account.platformId)?.name }} · {{ task.account.name
                }}<span> · {{ kindLabel(task.kind) }}</span>
              </p>
            </div>
          </div>
          <div class="task-meta">
            <span class="status-pill" :class="task.status"
              ><el-icon v-if="task.status === 'running'" class="is-loading"><Loading /></el-icon
              ><span
                v-else
                class="status-dot"
                :class="
                  task.status === 'submitted'
                    ? 'green'
                    : task.status === 'unknown'
                      ? 'amber'
                      : 'purple'
                "
              ></span
              >{{ labels[task.status] }}</span
            ><small>{{ formatTime(task.createdAt) }}</small>
          </div>
          <div class="task-actions">
            <el-button
              v-if="task.status === 'queued'"
              :disabled="(!studio.desktop && studio.busy) || task.armed"
              type="primary"
              plain
              size="small"
              @click="startTask(task)"
              >开始执行</el-button
            ><el-button
              v-if="studio.desktop && task.mode === 'live' && task.status === 'running'"
              type="danger"
              plain
              size="small"
              :loading="interrupting.has(task.id)"
              @click="interruptTask(task)"
              >中断任务</el-button
            ><button class="text-button" @click="showTask(task)">详情</button
            ><button
              v-if="['queued', 'scheduled', 'preview'].includes(task.status)"
              class="icon-button"
              :aria-label="'取消任务 ' + task.title"
              @click="cancelTask(task)"
            >
              <el-icon><Close /></el-icon>
            </button>
          </div>
        </div>
      </div>
      <el-pagination
        v-if="total > pageSize"
        v-model:current-page="page"
        class="list-pagination"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        aria-label="任务分页"
      />
      <div v-if="!total && !listLoading && !listError" class="empty-state">
        <el-icon><component :is="history ? 'Clock' : 'Files'" /></el-icon>
        <h2>
          {{
            query || status !== 'all'
              ? '没有符合条件的记录'
              : history
                ? '每次发布，都有迹可循'
                : '你的发布计划，从这里开始'
          }}
        </h2>
        <p>
          {{
            query || status !== 'all'
              ? '试着调整筛选条件。'
              : history
                ? '任务有提交结果后，会在这里按账号记录。'
                : '在发布中心选择内容和账号，加入队列后就能在这里查看。'
          }}
        </p>
        <el-button
          v-if="!query && status === 'all'"
          type="primary"
          @click="router.push('/publish-center')"
          >前往发布中心</el-button
        >
      </div>
    </div>
    <el-dialog
      :model-value="Boolean(selectedTask)"
      title="任务详情"
      width="580px"
      @update:model-value="selectedTask = undefined"
      ><template v-if="selectedTask"
        ><dl class="task-details">
          <dt>内容标题</dt>
          <dd>{{ selectedTask.title }}</dd>
          <dt>发布账号</dt>
          <dd>
            {{ getPlatform(selectedTask.account.platformId)?.name }} ·
            {{ selectedTask.account.name }}
          </dd>
          <dt>内容类型</dt>
          <dd>{{ kindLabel(selectedTask.kind) }}</dd>
          <template v-if="selectedTask.description">
            <dt>描述 / 正文</dt>
            <dd class="task-body">{{ selectedTask.description }}</dd>
          </template>
          <template v-if="selectedTask.kind === 'article' && selectedTask.body">
            <dt>文章正文</dt>
            <dd class="task-body">{{ selectedTask.body }}</dd>
          </template>
          <dt>创建时间</dt>
          <dd>{{ formatTime(selectedTask.createdAt) }}（北京时间）</dd>
          <dt>发布时间</dt>
          <dd>
            {{
              selectedTask.scheduleMode === 'later'
                ? formatTime(selectedTask.scheduledAt) + '（北京时间）'
                : '立即发布'
            }}
          </dd>
          <dt>当前状态</dt>
          <dd>{{ labels[selectedTask.status] }}</dd>
          <dt>说明</dt>
          <dd>{{ selectedTask.message }}</dd>
        </dl>
        <div v-if="events.length" class="task-logs" aria-label="任务日志">
          <p v-for="event in events" :key="event.id">
            <time>{{ formatTime(event.time) }}</time> {{ event.message }}
          </p>
        </div>
        <div v-if="studio.desktop && selectedTask.status === 'running'" class="task-verification">
          <el-input
            v-model="verificationCode"
            placeholder="平台要求时填写短信验证码"
            maxlength="12"
            show-password
          /><el-button @click="submitCode">提交验证码</el-button>
        </div>
        <div
          v-if="selectedTask.status === 'unknown' || selectedTask.status === 'submitted'"
          class="notice"
        >
          <el-icon><Warning /></el-icon
          ><span
            >平台接受提交与审核通过是不同状态。请到对应创作者中心核验，结果不明确时不要直接重复发布。</span
          >
        </div></template
      ><template #footer>
        <el-button @click="selectedTask = undefined">关闭</el-button>
        <el-button
          v-if="
            studio.desktop && selectedTask?.mode === 'live' && selectedTask.status === 'running'
          "
          type="danger"
          :loading="interrupting.has(selectedTask.id)"
          @click="interruptTask(selectedTask)"
          >中断任务</el-button
        >
      </template></el-dialog
    >
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { TaskEvent, TaskSummary } from '../../../shared/desktop'
import { useStudioStore } from '@/stores/studio'
import { formatTime, getPlatform, kindLabel } from '@/config/platforms'
import type { PublishTask, TaskStatus } from '@/types/studio'
import PlatformBadge from '@/components/PlatformBadge.vue'
const props = withDefaults(defineProps<{ history?: boolean }>(), { history: false })
const studio = useStudioStore(),
  router = useRouter(),
  query = ref(''),
  status = ref<TaskStatus | 'all'>('all'),
  selectedTask = ref<PublishTask>()
const labels: Record<TaskStatus, string> = {
  preview: '演示待执行',
  queued: '待执行',
  running: '执行中',
  submitted: '已提交 · 待核验',
  unknown: '结果待核验',
  cancelled: '已取消',
  scheduled: '等待本地定时',
  failed: '执行前校验失败',
  missed: '已错过执行时间',
}
const events = ref<TaskEvent[]>([])
const interrupting = ref(new Set<string>())
let detailRequest = 0
watch(
  () => selectedTask.value?.id,
  (id) => {
    if (!id) {
      detailRequest++
      events.value = []
      verificationCode.value = ''
    }
  },
)
const verificationCode = ref('')
async function submitCode() {
  if (!selectedTask.value) return
  try {
    await window.sauDesktop!.submitVerification(selectedTask.value.id, verificationCode.value)
    verificationCode.value = ''
    ElMessage.success('已提交给当前任务。')
  } catch (error) {
    ElMessage.error(String(error))
  }
}
async function showTask(task: TaskSummary) {
  const request = ++detailRequest
  verificationCode.value = ''
  events.value = []
  if (studio.desktop && task.mode === 'live') {
    try {
      const [detail, logs] = await Promise.all([
        window.sauDesktop!.taskDetail(task.id),
        window.sauDesktop!.taskEvents(task.id),
      ])
      if (request !== detailRequest) return
      selectedTask.value = detail
      events.value = logs
    } catch (error) {
      ElMessage.error(String(error))
    }
  } else selectedTask.value = task as PublishTask
}
watch(
  () => studio.revision,
  () => {
    if (selectedTask.value) void showTask(selectedTask.value)
  },
)
onBeforeUnmount(() => {
  detailRequest++
})
async function cancelTask(task: TaskSummary) {
  try {
    await studio.cancelTask(task.id)
  } catch (error) {
    ElMessage.error(String(error))
  }
}
async function interruptTask(task: TaskSummary) {
  if (interrupting.value.has(task.id)) return
  try {
    await ElMessageBox.confirm(
      '中断「' +
        task.title +
        '」的本地上传进程及其浏览器？平台可能已经接收内容，中断后请先到创作者中心核验，再决定是否重发。其他账号正在执行的任务会继续运行。',
      '中断正在执行的任务',
      { type: 'warning', confirmButtonText: '中断任务', cancelButtonText: '继续执行' },
    )
  } catch {
    return
  }
  interrupting.value.add(task.id)
  try {
    await studio.interruptTask(task.id)
    if (selectedTask.value?.id === task.id) {
      await showTask(task)
    }
    ElMessage.success('本地上传进程已中断，请核验平台结果。')
  } catch (error) {
    ElMessage.error(String(error))
  } finally {
    interrupting.value.delete(task.id)
  }
}
const filtered = computed(() =>
  studio.currentTasks.filter(
    (task) =>
      (!props.history ||
        ['submitted', 'unknown', 'cancelled', 'failed', 'missed'].includes(task.status)) &&
      (status.value === 'all' || task.status === status.value) &&
      (task.title + task.account.name + getPlatform(task.account.platformId)?.name)
        .toLowerCase()
        .includes(query.value.toLowerCase()),
  ),
)
const page = ref(1),
  pageSize = 25
const remoteTasks = ref<TaskSummary[]>([]),
  remoteTotal = ref(0),
  listLoading = ref(false),
  listError = ref('')
const total = computed(() => (studio.desktop ? remoteTotal.value : filtered.value.length))
const pagedTasks = computed(() =>
  studio.desktop
    ? remoteTasks.value
    : filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)
watch(
  () => props.history,
  () => {
    query.value = ''
    status.value = 'all'
    selectedTask.value = undefined
  },
)
watch([query, status, () => props.history], () => {
  page.value = 1
})
watch(
  () => filtered.value.length,
  (count) => {
    if (!studio.desktop) page.value = Math.min(page.value, Math.max(1, Math.ceil(count / pageSize)))
  },
)
watch(
  [page, query, status, () => props.history, () => studio.revision],
  (_value, _old, onCleanup) => {
    if (!studio.desktop) return
    let current = true
    listLoading.value = true
    const timer = setTimeout(async () => {
      try {
        const result = await window.sauDesktop!.taskPage({
          page: page.value,
          pageSize,
          query: query.value,
          status: status.value,
          history: props.history,
        })
        if (!current) return
        remoteTasks.value = result.items
        remoteTotal.value = result.total
        page.value = result.page
        listError.value = ''
      } catch (error) {
        if (current) listError.value = '任务读取失败：' + String(error)
      } finally {
        if (current) listLoading.value = false
      }
    }, 150)
    onCleanup(() => {
      current = false
      clearTimeout(timer)
    })
  },
  { immediate: true },
)
async function startTask(task: TaskSummary) {
  try {
    await ElMessageBox.confirm(
      (task.scheduleMode === 'later' && studio.desktop ? '将启用本地定时执行「' : '将实际发布「') +
        task.title +
        '」到 ' +
        getPlatform(task.account.platformId)?.name +
        ' · ' +
        task.account.name +
        '。请确认内容和账号。',
      '开始发布',
      { confirmButtonText: '确认并开始', cancelButtonText: '继续检查' },
    )
    try {
      await studio.runTask(task.id)
    } catch (error) {
      ElMessage.error(String(error))
    }
  } catch {
    /* User has not started the task. */
  }
}
async function exportTasks() {
  if (studio.desktop) {
    try {
      await window.sauDesktop!.exportContent('tasks', {
        query: query.value,
        status: status.value,
        history: props.history,
      })
    } catch (error) {
      ElMessage.error(String(error))
    }
    return
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(filtered.value, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'sau-publish-records.json'
  link.click()
  URL.revokeObjectURL(url)
}
</script>
<style scoped>
.task-total {
  margin-left: auto;
  font-size: 12px;
}
.task-logs {
  background: var(--page);
  padding: 14px;
  max-height: 240px;
  overflow: auto;
  font: 12px/1.8 monospace;
  margin-bottom: 20px;
}
.task-logs p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.task-logs time {
  color: var(--muted);
}
.task-verification {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}
.task-row {
  display: flex;
  align-items: center;
  gap: 25px;
  padding: 23px 4px;
  border-bottom: 1px solid var(--stroke);
}
.task-content {
  display: flex;
  align-items: center;
  gap: 15px;
  min-width: 0;
  flex: 1;
}
.task-content h3 {
  font-size: 15px;
  font-weight: 550;
  overflow-wrap: anywhere;
}
.task-content p {
  font-size: 12px;
  color: var(--muted);
  margin-top: 7px;
}
.task-meta {
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-width: 135px;
}
.task-meta small {
  color: var(--muted);
  font-size: 11px;
}
.task-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 75px;
  justify-content: flex-end;
}
.task-details {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 18px;
  line-height: 1.8;
  margin-bottom: 25px;
  font-size: 13px;
}
.task-details dt {
  color: var(--muted);
}
.task-details dd {
  color: var(--text);
  overflow-wrap: anywhere;
}
.task-body {
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
}
@media (max-width: 800px) {
  .task-row {
    flex-wrap: wrap;
    gap: 16px;
  }
  .task-content {
    flex-basis: calc(100% - 155px);
  }
  .task-actions {
    margin-left: auto;
  }
  .task-content p span {
    display: none;
  }
}
</style>
