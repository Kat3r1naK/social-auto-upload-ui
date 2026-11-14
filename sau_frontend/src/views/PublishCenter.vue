<template>
  <section class="route-page composer-page">
    <header class="page-head">
      <div class="title-line">
        <h1>{{ activeDraftId ? '编辑发布' : '新建发布' }}</h1>
        <span v-if="studio.mode === 'demo'" class="sample-label">示例内容</span
        ><span v-if="savedLabel" class="saved-label"
          ><el-icon><Check /></el-icon>{{ savedLabel }}</span
        >
      </div>
    </header>
    <div class="composer-scroll">
      <div class="composer-grid">
        <div class="composer-editor">
          <div class="content-modes" role="tablist" aria-label="内容类型">
            <button
              v-for="kind in contentKinds"
              :key="kind.id"
              role="tab"
              :aria-selected="currentKind === kind.id"
              :class="{ selected: currentKind === kind.id }"
              @click="changeKind(kind.id)"
            >
              <el-icon><component :is="kind.icon" /></el-icon>{{ kind.label }}
            </button>
          </div>
          <div v-if="studio.connectionError && studio.mode === 'live'" class="notice">
            <el-icon><Warning /></el-icon><span>{{ studio.connectionError }}</span>
          </div>
          <div
            v-if="form.kind !== 'article'"
            class="media-area"
            @dragover.prevent
            @drop.prevent="handleDrop"
          >
            <div
              v-if="form.assets.length"
              class="imported-media"
              :class="{ 'note-media': form.kind === 'note' }"
            >
              <template v-if="form.kind === 'video'">
                <button
                  class="media-thumbnail"
                  aria-label="预览已选素材"
                  @click="previewOpen = true"
                >
                  <img
                    v-if="form.assets[0].sample"
                    :src="form.assets[0].url"
                    alt="云雾中的青绿色山林"
                  /><video
                    v-else-if="form.assets[0].url"
                    :src="form.assets[0].url"
                    preload="metadata"
                  /><el-icon v-else><VideoCamera /></el-icon
                  ><span v-if="form.assets[0].duration">{{ form.assets[0].duration }}</span>
                </button>
                <div class="media-info">
                  <strong>{{ form.assets[0].name }}</strong>
                  <p>
                    {{ form.assets[0].duration ? form.assets[0].duration + ' · ' : ''
                    }}{{ formatSize(form.assets[0].size) }}
                  </p>
                  <button class="replace-media text-button" @click="libraryOpen = true">
                    从素材库更换
                  </button>
                  <button
                    v-if="!form.assets[0].url"
                    class="text-button"
                    @click="fileInput?.click()"
                  >
                    重新选择文件
                  </button>
                </div>
                <button
                  class="icon-button preview-media-button"
                  aria-label="预览素材"
                  @click="previewOpen = true"
                >
                  <el-icon><VideoPlay /></el-icon>
                </button>
                <button class="icon-button" aria-label="移除素材" @click="removeAsset(0)">
                  <el-icon><Delete /></el-icon>
                </button>
              </template>
              <template v-else
                ><div v-for="(asset, index) in form.assets" :key="asset.id" class="note-image">
                  <img v-if="asset.url" :src="asset.url" :alt="asset.name" />
                  <button
                    v-else
                    class="missing-note"
                    :aria-label="'重新选择 ' + asset.name"
                    @click="reselectNote(index)"
                  >
                    <el-icon><FolderOpened /></el-icon><span>重新选择文件</span>
                  </button>
                  <button
                    class="remove-note"
                    :aria-label="'移除第 ' + (index + 1) + ' 张图片'"
                    @click="removeAsset(index)"
                  >
                    <el-icon><Close /></el-icon></button
                  ><span>{{ index + 1 }}</span>
                </div>
                <button class="add-note" aria-label="添加图片" @click="fileInput?.click()">
                  <el-icon><Plus /></el-icon></button
              ></template>
            </div>
            <div v-else class="drop-area">
              <el-icon><UploadFilled /></el-icon
              ><strong>{{ form.kind === 'video' ? '把视频拖到这里' : '把图片拖到这里' }}</strong>
              <p>
                {{
                  form.kind === 'video'
                    ? '选择本地视频，或从素材库中添加'
                    : '支持多张图片，按添加顺序发布'
                }}
              </p>
              <div>
                <el-button type="primary" @click="fileInput?.click()">选择文件</el-button
                ><el-button @click="libraryOpen = true">从素材库添加</el-button>
              </div>
            </div>
          </div>
          <button
            v-if="form.assets.length && form.kind === 'note'"
            class="replace-media text-button"
            @click="libraryOpen = true"
          >
            <el-icon><FolderOpened /></el-icon>从素材库更换
          </button>
          <p v-if="form.assets.some((asset) => !asset.url)" class="field-hint">
            本地文件信息已恢复，请重新选择文件以继续预览。
          </p>
          <form class="composer-form" @submit.prevent @input="markEdited" @change="markEdited">
            <div class="field">
              <label for="publish-title">标题 <span class="required">*</span></label
              ><el-input
                id="publish-title"
                v-model="form.title"
                placeholder="给这次分享起个标题"
                :maxlength="100"
                show-word-limit
              />
            </div>
            <div v-if="form.kind !== 'article' || !studio.desktop" class="field">
              <label for="publish-description">{{
                form.kind === 'note' ? '正文' : '描述'
              }}</label><el-input
                id="publish-description"
                v-model="form.description"
                type="textarea"
                :rows="form.kind === 'note' ? 4 : 2"
                :maxlength="form.kind === 'note' ? 1000 : 5000"
                show-word-limit
                placeholder="写下你想分享的内容…"
                resize="vertical"
              />
            </div>
            <div v-if="form.kind === 'article'" class="field">
              <div class="article-label">
                <label for="article-body">文章正文 <span class="required">*</span></label
                ><button type="button" class="text-button" @click="articleInput?.click()">
                  <el-icon><Upload /></el-icon>导入文章
                </button>
              </div>
              <el-input
                id="article-body"
                v-model="form.body"
                type="textarea"
                :rows="12"
                placeholder="从这里开始写作，支持 Markdown，也可导入 HTML 或 TXT。"
              />
              <p class="field-hint">正文插图与独立图文帖分别处理。右侧为正文预览。</p>
            </div>
            <div v-if="form.kind !== 'article' || !studio.desktop" class="field tags-field">
              <label for="tag-input">话题标签</label>
              <div class="tag-editor">
                <span v-for="(tag, index) in form.tags" :key="tag" class="topic-tag"
                  >{{ tag
                  }}<button type="button" :aria-label="'移除标签 ' + tag" @click="removeTag(index)">
                    <el-icon><Close /></el-icon></button></span
                ><el-input
                  v-if="tagEditing"
                  id="tag-input"
                  ref="tagInput"
                  v-model="newTag"
                  class="tag-input"
                  placeholder="输入后按回车"
                  maxlength="40"
                  @keydown.enter.prevent="addTag"
                  @blur="addTag"
                /><button v-else type="button" class="add-tag" @click="startTagInput">
                  <el-icon><Plus /></el-icon>添加标签
                </button>
              </div>
            </div>
            <div class="override-section">
              <button
                type="button"
                class="override-toggle"
                :aria-expanded="overridesOpen"
                @click="overridesOpen = !overridesOpen"
              >
                <el-icon><component :is="overridesOpen ? 'ArrowUp' : 'ArrowDown'" /></el-icon
                ><strong>按平台调整内容</strong><span class="scope-label">公共配置</span
                ><span class="override-description">应用于全部目标账号</span>
              </button>
              <div v-if="overridesOpen" class="override-list">
                <p v-if="!selectedAccounts.length" class="field-hint">
                  添加发布账号后，可分别调整标题和描述。
                </p>
                <button
                  v-for="account in selectedAccounts"
                  :key="account.id"
                  type="button"
                  class="override-row"
                  @click="openOverride(account)"
                >
                  <PlatformBadge :id="account.platformId" small /><span
                    >{{ getPlatform(account.platformId)?.name }} · {{ account.name }}</span
                  ><small>{{ form.overrides[account.id] ? '已自定义' : '沿用公共内容' }}</small
                  ><el-icon><EditPen /></el-icon>
                </button>
              </div>
            </div>
            <PlatformOptions
              v-if="studio.desktop && studio.mode === 'live' && selectedAccounts.length"
              v-model="form.platformOptions"
              :platform-ids="[...new Set(selectedAccounts.map((account) => account.platformId))]"
              :kind="form.kind"
              @update:model-value="markEdited"
            />
            <div class="field schedule-field">
              <label>发布时间</label
              ><el-radio-group v-model="form.scheduleMode" @change="markEdited"
                ><el-radio value="now">立即发布</el-radio
                ><el-radio value="later">{{
                  studio.desktop && studio.mode === 'live' ? '本地定时执行' : '定时发布'
                }}</el-radio></el-radio-group
              >
              <div v-if="form.scheduleMode === 'later'" class="schedule-settings">
                <p v-if="studio.desktop && studio.mode === 'live'" class="field-hint">
                  到时由客户端开始上传，请保持电脑开机、网络可用及客户端在后台运行。不是平台原生定时。
                </p>
                <el-date-picker
                  v-model="form.scheduledAt"
                  type="datetime"
                  value-format="YYYY-MM-DDTHH:mm:ss"
                  placeholder="选择发布时间"
                  :disabled-date="(date: Date) => date.getTime() < Date.now() - 86400000"
                  @change="markEdited"
                />
                <p class="field-hint">
                  {{
                    studio.mode === 'demo'
                      ? '示例排程仅保存时间，不会执行发布。时间按本机时区显示。'
                      : studio.desktop
                        ? '按电脑时区选择时间；开始任务后由本地队列执行。'
                        : '时间按本机时区显示；原生定时与本地定时将在发布服务中分别处理。'
                  }}
                </p>
              </div>
            </div>
          </form>
        </div>
        <aside class="composer-aside" aria-label="发布目标与预览">
          <section class="destinations">
            <h2>发布到 {{ selectedAccounts.length }} 个账号</h2>
            <div v-if="selectedAccounts.length" class="destination-list">
              <button
                v-for="account in selectedAccounts"
                :key="account.id"
                class="destination-row"
                @click="openOverride(account)"
              >
                <PlatformBadge :id="account.platformId" /><AccountAvatar
                  :account="account"
                  :demo="studio.mode === 'demo'"
                  class="account-avatar"
                /><span class="destination-name"
                  >{{ getPlatform(account.platformId)?.name }} · {{ account.name }}</span
                ><span class="status-pill" :class="account.status"
                  ><span
                    class="status-dot"
                    :class="account.status === 'valid' ? 'green' : 'amber'"
                  ></span
                  >{{ account.status === 'valid' ? '已登录' : '需登录' }}</span
                ><el-icon><ArrowRight /></el-icon>
              </button>
            </div>
            <div v-else class="targets-empty">
              <el-icon><User /></el-icon>
              <p>选择这次内容要发布到的账号</p>
            </div>
            <button class="add-destination" @click="openAccountPicker">
              <el-icon><Plus /></el-icon>添加平台与账号
            </button>
          </section>
          <section class="preview-section">
            <div class="preview-heading">
              <h2>内容预览</h2>
              <el-tooltip content="展示公共内容的排版示意，实际样式以各平台为准。"
                ><el-icon tabindex="0" aria-label="预览说明"><InfoFilled /></el-icon
              ></el-tooltip>
            </div>
            <div class="content-preview">
              <button
                v-if="form.kind !== 'article' && form.assets[0]?.url"
                class="preview-image"
                :aria-label="form.kind === 'video' ? '打开视频预览' : '打开图片预览'"
                @click="previewOpen = true"
              >
                <img
                  v-if="form.assets[0].sample || form.kind === 'note'"
                  :src="form.assets[0].url"
                  alt="当前内容的预览封面"
                /><video v-else :src="form.assets[0].url" preload="metadata" /><el-icon
                  v-if="form.kind === 'video'"
                  class="play-icon"
                  ><VideoPlay /></el-icon
                ><span v-if="form.assets[0].duration" class="preview-duration">{{
                  form.assets[0].duration
                }}</span>
              </button>
              <div v-else-if="form.kind !== 'article'" class="preview-placeholder">
                <el-icon><Picture /></el-icon>
                <p>
                  {{ form.assets.length ? '重新选择本地文件后显示预览' : '添加素材后显示预览' }}
                </p>
              </div>
              <div class="preview-copy">
                <h3>{{ form.title || '你的标题会显示在这里' }}</h3>
                <p>{{ form.description || '写点内容，让大家更了解这次分享。' }}</p>
                <div
                  v-if="form.kind === 'article'"
                  class="article-preview"
                  v-html="articleHtml"
                ></div>
                <div v-if="form.tags.length" class="preview-tags">
                  <span v-for="tag in form.tags" :key="tag"># {{ tag }}</span>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
    <footer class="composer-footer">
      <span class="task-count"
        >将创建 <strong>{{ selectedAccounts.length }}</strong> 个发布任务</span
      >
      <div class="footer-actions">
        <el-button size="large" @click="save"
          ><el-icon><Collection /></el-icon>保存草稿</el-button
        ><el-button type="primary" size="large" :loading="submitting" @click="submit"
          ><el-icon><Promotion /></el-icon>加入发布队列</el-button
        >
      </div>
    </footer>
    <input
      ref="fileInput"
      class="file-input"
      type="file"
      :multiple="form.kind === 'note'"
      :accept="form.kind === 'note' ? 'image/*' : 'video/*,.mkv'"
      @change="handleFiles"
      @cancel="replaceNoteIndex = undefined"
    />
    <input
      ref="articleInput"
      class="file-input"
      type="file"
      accept=".md,.markdown,.html,.htm,.txt"
      @change="handleArticle"
    />
    <el-dialog v-model="accountsOpen" title="选择发布账号" width="760px"
      ><div class="picker-search">
        <el-input
          v-model="accountQuery"
          placeholder="搜索平台或账号"
          prefix-icon="Search"
          clearable
        /><span class="text-muted">已选择 {{ pickedAccountIds.length }} 个</span>
      </div>
      <div class="platform-filter">
        <button :class="{ active: accountPlatform === 'all' }" @click="accountPlatform = 'all'">
          全部平台</button
        ><button
          v-for="platform in compatiblePlatforms"
          :key="platform.id"
          :class="{ active: accountPlatform === platform.id }"
          @click="accountPlatform = platform.id"
        >
          <PlatformBadge :id="platform.id" small />{{ platform.name }}
        </button>
      </div>
      <div class="picker-accounts">
        <el-checkbox-group v-model="pickedAccountIds"
          ><div v-for="account in filteredPickerAccounts" :key="account.id" class="picker-account">
            <el-checkbox :value="account.id" :disabled="account.status !== 'valid'"
              ><PlatformBadge :id="account.platformId" /><span
                >{{ account.name
                }}<small
                  >{{ getPlatform(account.platformId)?.name }} ·
                  {{ account.group || '未分组' }}</small
                ></span
              ></el-checkbox
            ><span class="status-pill" :class="account.status">{{
              account.status === 'valid' ? '已登录' : '需重新登录'
            }}</span>
          </div></el-checkbox-group
        >
        <div v-if="!filteredPickerAccounts.length" class="empty-state">
          <el-icon><User /></el-icon>
          <h2>这个平台还没有可用账号</h2>
          <p>添加账号后，就能在这里选择发布目标。</p>
          <el-button @click="goToAccounts">前往账号管理</el-button>
        </div>
      </div>
      <p class="dialog-hint">
        仅展示支持{{ kindLabel(form.kind) }}的账号。示例工作区中的账号为虚构数据。
      </p>
      <template #footer
        ><el-button @click="accountsOpen = false">取消</el-button
        ><el-button type="primary" @click="confirmAccounts">确认选择</el-button></template
      ></el-dialog
    >
    <el-dialog v-model="overrideOpen" title="账号个性化内容" width="560px"
      ><template v-if="editingAccount"
        ><div class="override-account">
          <PlatformBadge :id="editingAccount.platformId" /><strong
            >{{ getPlatform(editingAccount.platformId)?.name }} · {{ editingAccount.name }}</strong
          >
        </div>
        <p class="dialog-hint">仅对这个账号生效。留空的字段沿用公共内容。</p>
        <div class="field">
          <label for="override-title">标题</label
          ><el-input
            id="override-title"
            v-model="overrideForm.title"
            :placeholder="form.title"
            maxlength="100"
            show-word-limit
          />
        </div>
        <div class="field">
          <label for="override-description">描述 / 正文</label
          ><el-input
            id="override-description"
            v-model="overrideForm.description"
            :placeholder="form.description"
            type="textarea"
            :rows="4"
          /></div></template
      ><template #footer
        ><el-button @click="resetOverride">恢复公共内容</el-button
        ><el-button type="primary" @click="saveOverride">保存设置</el-button></template
      ></el-dialog
    >
    <el-dialog v-model="libraryOpen" title="从素材库添加" width="680px"
      ><div class="library-list">
        <button v-for="asset in compatibleMaterials" :key="asset.id" @click="selectMaterial(asset)">
          <img v-if="asset.sample || asset.kind === 'note'" :src="asset.url" alt="" /><el-icon
            v-else
            ><component :is="asset.kind === 'article' ? 'Document' : 'VideoCamera'" /></el-icon
          ><span
            ><strong>{{ asset.name }}</strong
            ><small>{{ formatSize(asset.size) }}</small></span
          ><el-icon><Plus /></el-icon>
        </button>
        <div v-if="!compatibleMaterials.length" class="empty-state">
          <el-icon><FolderOpened /></el-icon>
          <h2>还没有{{ kindLabel(form.kind) }}素材</h2>
          <el-button @click="pickLocalFile">选择本地文件</el-button>
        </div>
      </div></el-dialog
    >
    <el-dialog v-model="previewOpen" title="素材预览" width="800px"
      ><template v-if="form.assets[0]"
        ><img
          v-if="form.assets[0].sample || form.kind === 'note'"
          class="full-media-preview"
          :src="form.assets[0].url"
          :alt="form.assets[0].name"
        /><video
          v-else-if="form.assets[0].url"
          class="full-media-preview"
          :src="form.assets[0].url"
          controls
        />
        <p v-else class="dialog-hint">本地文件需要重新选择后才能预览。</p>
        <p v-if="form.assets[0].sample" class="dialog-hint">
          这是示例封面，用于展示内容预览效果。
        </p></template
      ></el-dialog
    >
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { InputInstance } from 'element-plus'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { contentKinds, getPlatform, kindLabel, platforms } from '@/config/platforms'
import { createComposer, useStudioStore } from '@/stores/studio'
import type {
  Account,
  AccountId,
  AccountOverride,
  ComposerForm,
  ContentKind,
  Material,
} from '@/types/studio'
import { fileKind, formatSize, importMaterial } from '@/utils/media'
import PlatformBadge from '@/components/PlatformBadge.vue'
import AccountAvatar from '@/components/AccountAvatar.vue'
import PlatformOptions from '@/components/PlatformOptions.vue'
const studio = useStudioStore(),
  router = useRouter(),
  route = useRoute()
const currentKind = ref<ContentKind>('video')
const forms = reactive<Record<ContentKind, ComposerForm>>({
  video: createComposer('video', studio.mode === 'demo'),
  note: createComposer('note', studio.mode === 'demo'),
  article: createComposer('article', studio.mode === 'demo'),
})
const draftIds = reactive<Partial<Record<ContentKind, string>>>({})
const form = computed(() => forms[currentKind.value])
const activeDraftId = computed(() => draftIds[currentKind.value])
const selectedAccounts = computed(() =>
  form.value.selectedAccountIds
    .map((id) => studio.accounts.find((account) => account.id === id))
    .filter((account): account is Account => Boolean(account)),
)
const compatiblePlatforms = computed(() =>
  platforms.filter((platform) => platform.kinds.includes(form.value.kind)),
)
const compatibleMaterials = computed(() =>
  studio.materials.filter((asset) => asset.kind === form.value.kind),
)
const articleHtml = computed(() =>
  DOMPurify.sanitize(marked.parse(form.value.body, { async: false })),
)
const fileInput = ref<HTMLInputElement>(),
  articleInput = ref<HTMLInputElement>(),
  tagInput = ref<InputInstance>()
const replaceNoteIndex = ref<number>()
const tagEditing = ref(false),
  newTag = ref(''),
  savedLabel = ref(''),
  previewOpen = ref(false),
  libraryOpen = ref(false),
  accountsOpen = ref(false),
  overrideOpen = ref(false),
  overridesOpen = ref(false),
  submitting = ref(false)
const accountQuery = ref(''),
  accountPlatform = ref('all'),
  pickedAccountIds = ref<AccountId[]>([]),
  editingAccount = ref<Account>()
const overrideForm = reactive<AccountOverride>({ title: '', description: '' })
const filteredPickerAccounts = computed(() =>
  studio.accounts.filter(
    (account) =>
      getPlatform(account.platformId)?.kinds.includes(form.value.kind) &&
      (accountPlatform.value === 'all' || account.platformId === accountPlatform.value) &&
      (account.name + getPlatform(account.platformId)?.name)
        .toLowerCase()
        .includes(accountQuery.value.toLowerCase()),
  ),
)
let edited = false,
  autoSaveTimer: ReturnType<typeof setTimeout> | undefined
function persist(silent = false) {
  draftIds[currentKind.value] = studio.saveDraft(form.value, activeDraftId.value)
  savedLabel.value = '已保存'
  edited = false
  if (!silent) ElMessage.success('草稿已保存到当前工作区。')
}
function save() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  persist()
}
function markEdited() {
  edited = true
  savedLabel.value = '保存中…'
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => persist(true), 900)
}
function changeKind(kind: ContentKind) {
  replaceNoteIndex.value = undefined
  if (edited) persist(true)
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  currentKind.value = kind
  savedLabel.value = draftIds[kind] ? '已保存' : ''
}
watch(
  () => route.query.draft,
  (value) => {
    const draft = studio.currentDrafts.find((item) => item.id === value)
    if (draft) {
      currentKind.value = draft.kind
      forms[draft.kind] = JSON.parse(JSON.stringify(draft)) as ComposerForm
      draftIds[draft.kind] = draft.id
      savedLabel.value = '已保存'
    }
  },
  { immediate: true },
)
watch(
  () => route.query.kind,
  (value) => {
    if (value === 'video' || value === 'note' || value === 'article') changeKind(value)
  },
  { immediate: true },
)
watch(
  () => studio.mode,
  () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    for (const kind of contentKinds) {
      forms[kind.id] = createComposer(kind.id, studio.mode === 'demo')
      delete draftIds[kind.id]
    }
    savedLabel.value = ''
    edited = false
  },
)
async function startTagInput() {
  tagEditing.value = true
  await nextTick()
  tagInput.value?.focus()
}
function addTag() {
  const value = newTag.value.trim().replace(/^#+/, '')
  if (value && !form.value.tags.includes(value)) {
    form.value.tags.push(value)
    markEdited()
  }
  newTag.value = ''
  tagEditing.value = false
}
function removeTag(index: number) {
  form.value.tags.splice(index, 1)
  markEdited()
}
function goToAccounts() {
  accountsOpen.value = false
  void router.push('/account-management')
}
function pickLocalFile() {
  libraryOpen.value = false
  if (form.value.kind === 'article') articleInput.value?.click()
  else fileInput.value?.click()
}
function removeAsset(index: number) {
  form.value.assets.splice(index, 1)
  markEdited()
}
function reselectNote(index: number) {
  replaceNoteIndex.value = index
  fileInput.value?.click()
}
async function addFiles(files: File[]) {
  if (!files.length) return
  const expectedKind = form.value.kind
  const targetForm = form.value
  try {
    const assets: Material[] = []
    if (files.some((file) => fileKind(file) !== expectedKind))
      throw new Error('请选择' + kindLabel(expectedKind) + '类型的素材。')
    for (const file of files) {
      const asset = await importMaterial(file, studio.mode === 'live')
      assets.push(asset)
    }
    if (expectedKind === 'note' && replaceNoteIndex.value !== undefined)
      targetForm.assets.splice(replaceNoteIndex.value, 1, ...assets)
    else
      targetForm.assets =
        expectedKind === 'video' ? assets.slice(0, 1) : [...targetForm.assets, ...assets]
    markEdited()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '素材导入失败。')
  }
}
async function handleFiles(event: Event) {
  const input = event.target as HTMLInputElement
  await addFiles(Array.from(input.files || []))
  replaceNoteIndex.value = undefined
  input.value = ''
}
function handleDrop(event: DragEvent) {
  void addFiles(Array.from(event.dataTransfer?.files || []))
}
async function handleArticle(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    try {
      const asset = await importMaterial(file, studio.desktop && studio.mode === 'live')
      form.value.body = asset.body || ''
      form.value.articleBasePath = asset.localPath
      if (!form.value.title) form.value.title = file.name.replace(/\.[^.]+$/, '')
      markEdited()
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '文章导入失败。')
    }
  }
  input.value = ''
}
async function selectMaterial(asset: Material) {
  if (studio.desktop && asset.kind === 'article') {
    try {
      asset = await window.sauDesktop!.materialDetail(String(asset.id))
    } catch (error) {
      ElMessage.error(String(error))
      return
    }
  }
  if (form.value.kind === 'article') {
    form.value.body = asset.body || ''
    form.value.articleBasePath = asset.localPath
  } else form.value.assets = form.value.kind === 'video' ? [asset] : [...form.value.assets, asset]
  libraryOpen.value = false
  markEdited()
}
function openAccountPicker() {
  pickedAccountIds.value = selectedAccounts.value.map((account) => account.id)
  accountQuery.value = ''
  accountPlatform.value = 'all'
  accountsOpen.value = true
}
function confirmAccounts() {
  form.value.selectedAccountIds = [...pickedAccountIds.value]
  accountsOpen.value = false
  markEdited()
}
function openOverride(account: Account) {
  editingAccount.value = account
  Object.assign(overrideForm, form.value.overrides[account.id] || { title: '', description: '' })
  overrideOpen.value = true
}
function saveOverride() {
  if (editingAccount.value) {
    if (overrideForm.title.trim() || overrideForm.description.trim())
      form.value.overrides[editingAccount.value.id] = { ...overrideForm }
    else delete form.value.overrides[editingAccount.value.id]
  }
  overrideOpen.value = false
  markEdited()
}
function resetOverride() {
  if (editingAccount.value) delete form.value.overrides[editingAccount.value.id]
  overrideOpen.value = false
  markEdited()
}
async function submit() {
  if (submitting.value) return
  form.value.selectedAccountIds = selectedAccounts.value.map((account) => account.id)
  if (studio.mode === 'live') {
    try {
      await ElMessageBox.confirm(
        '将为所选账号创建待执行任务。你可以在任务中心检查内容后手动开始发布。',
        '检查发布清单',
        { confirmButtonText: '加入队列', cancelButtonText: '继续编辑' },
      )
    } catch {
      return
    }
  }
  submitting.value = true
  try {
    const count = await studio.addTasks(form.value)
    persist(true)
    ElMessage.success(
      studio.mode === 'demo'
        ? '已创建 ' + count + ' 个演示任务，不会实际发布。'
        : '已加入队列，请到任务中心检查并开始执行。',
    )
    await router.push('/tasks')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '任务创建失败。')
  } finally {
    submitting.value = false
  }
}
const unsubscribeSuspend = studio.onBeforeSuspend(async () => {
  if (submitting.value) throw new Error('正在提交任务。')
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  if (edited) persist(true)
  if (activeDraftId.value)
    await router.replace({ path: '/publish-center', query: { draft: activeDraftId.value } })
})
onBeforeUnmount(() => {
  unsubscribeSuspend()
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  if (edited) persist(true)
})
</script>
<style scoped>
.composer-page .page-head {
  padding-bottom: 25px;
}
.saved-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--muted);
}
.composer-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.composer-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 355px;
  gap: 28px;
  padding: 0 28px 30px 36px;
}
.composer-editor {
  min-width: 0;
}
.content-modes {
  display: flex;
  gap: 12px;
  margin: 1px 0 29px;
}
.content-modes button {
  min-width: 136px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 1px solid var(--stroke);
  border-radius: 7px;
  color: var(--secondary);
  font-size: 17px;
}
.content-modes .el-icon {
  font-size: 21px;
}
.content-modes button:hover {
  background: var(--hover);
}
.content-modes button.selected {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
  font-weight: 550;
}
.imported-media {
  display: flex;
  gap: 18px;
  align-items: center;
  min-height: 139px;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--stroke);
  border-radius: 11px;
}
.media-thumbnail {
  flex-shrink: 0;
  width: 194px;
  height: 112px;
  position: relative;
  overflow: hidden;
  border-radius: 7px;
}
.media-thumbnail > img,
.media-thumbnail > video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.media-thumbnail > .el-icon {
  font-size: 32px;
  color: var(--accent);
}
.media-thumbnail > span {
  position: absolute;
  bottom: 5px;
  right: 5px;
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.65);
  color: white;
}
.media-info {
  flex: 1;
  min-width: 0;
}
.media-info strong {
  font-size: 17px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.media-info p {
  color: var(--secondary);
  font-size: 14px;
  margin-top: 12px;
}
.imported-media > .icon-button {
  flex-shrink: 0;
}
.preview-media-button {
  margin-right: 3px;
}
.replace-media {
  font-size: 11px;
  margin-top: 5px;
  opacity: 0.8;
}
.composer-form {
  margin-top: 26px;
}
.field {
  margin-bottom: 25px;
}
.field > label,
.article-label > label {
  display: block;
  margin-bottom: 13px;
  font-size: 16px;
  font-weight: 550;
}
.required {
  color: var(--red);
  font-weight: 400;
  margin-left: 4px;
}
.field :deep(.el-input__wrapper) {
  min-height: 43px;
}
.field :deep(.el-input__inner),
.field :deep(.el-textarea__inner) {
  font-size: 15px;
}
.field :deep(.el-textarea__inner) {
  min-height: 105px;
  padding-bottom: 25px;
}
.field :deep(.el-input__count) {
  font-size: 11px;
  right: 13px;
}
.tag-editor {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 38px;
}
.topic-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 13px;
  border: 1px solid var(--input-stroke);
  background: var(--accent-soft);
  border-radius: 20px;
  color: var(--text);
  font-size: 13px;
}
.topic-tag button {
  display: flex;
  color: var(--secondary);
}
.add-tag {
  border: 1px dashed var(--input-stroke);
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: 19px;
  padding: 7px 14px;
  font-size: 13px;
  color: var(--secondary);
}
.tag-input {
  width: 160px;
}
.override-section {
  border-block: 1px solid var(--input-stroke);
  padding: 16px 0;
  margin: 30px 0 25px;
}
.override-toggle {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  width: 100%;
  text-align: left;
}
.override-toggle strong {
  font-size: 15px;
  font-weight: 550;
  margin-right: 9px;
}
.scope-label {
  font-size: 11px;
  color: #bca1ec;
  background: var(--accent-soft);
  padding: 3px 8px;
  border-radius: 5px;
}
.override-description {
  color: var(--muted);
  font-size: 12px;
}
.override-list {
  padding-top: 15px;
}
.override-row {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 9px;
  color: var(--secondary);
  padding: 11px 0;
  font-size: 12px;
}
.override-row small {
  margin-left: auto;
  color: var(--muted);
}
.schedule-field .el-radio {
  margin-right: 35px;
}
.schedule-field :deep(.el-radio__label) {
  font-size: 15px;
  padding-left: 12px;
}
.schedule-field :deep(.el-radio__inner) {
  width: 19px;
  height: 19px;
}
.schedule-field :deep(.el-radio__input.is-checked + .el-radio__label) {
  color: var(--text);
}
.schedule-settings {
  margin-top: 16px;
}
.field-hint {
  font-size: 11px;
  color: var(--muted);
  margin-top: 10px;
  line-height: 1.8;
}
.composer-aside {
  margin-top: 5px;
  border-left: 1px solid var(--input-stroke);
  padding-left: 28px;
  min-width: 0;
}
.destinations h2,
.preview-heading h2 {
  font-size: 19px;
  font-weight: 600;
}
.destination-list {
  margin-top: 12px;
}
.destination-row {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 61px;
  border-bottom: 1px solid var(--input-stroke);
  gap: 9px;
  text-align: left;
}
.destination-row > .el-icon {
  color: var(--secondary);
  margin-left: auto;
  font-size: 16px;
}
.account-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.destination-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.destination-row .status-pill {
  font-size: 10px;
  gap: 5px;
}
.add-destination {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: var(--accent);
  padding: 21px 0 24px;
  font-size: 16px;
  font-weight: 550;
}
.targets-empty {
  padding: 25px 0 5px;
  color: var(--muted);
  text-align: center;
  font-size: 12px;
}
.targets-empty .el-icon {
  font-size: 26px;
  margin-bottom: 10px;
}
.preview-section {
  border-top: 1px solid var(--input-stroke);
  padding-top: 22px;
  margin-top: 3px;
}
.preview-heading {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 22px;
}
.preview-heading > .el-icon {
  font-size: 13px;
  color: var(--muted);
}
.content-preview {
  background: var(--surface);
  border-radius: 8px;
  overflow: hidden;
}
.preview-image {
  display: block;
  width: 100%;
  aspect-ratio: 1.75;
  overflow: hidden;
  position: relative;
}
.preview-image > img,
.preview-image > video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.play-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 52px;
  color: white;
  filter: drop-shadow(0 1px 5px rgba(0, 0, 0, 0.45));
}
.preview-duration {
  position: absolute;
  right: 7px;
  bottom: 7px;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
}
.preview-copy {
  padding: 16px 15px 18px;
}
.preview-copy h3 {
  font-size: 17px;
  line-height: 1.6;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.preview-copy > p {
  margin-top: 7px;
  font-size: 13px;
  color: var(--secondary);
  line-height: 1.9;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.preview-tags {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.preview-tags span {
  font-size: 11px;
  border-radius: 15px;
  background: var(--accent-soft);
  padding: 4px 10px;
  color: #c7b4e8;
}
[data-theme='light'] .preview-tags span {
  color: var(--accent);
}
.preview-placeholder {
  padding: 45px 15px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}
.preview-placeholder .el-icon {
  font-size: 30px;
  margin-bottom: 12px;
}
.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 28px 20px 32px;
  border-top: 1px solid var(--stroke);
  background: var(--surface);
  flex-shrink: 0;
}
.task-count {
  font-size: 16px;
  font-weight: 550;
  white-space: nowrap;
}
.task-count strong {
  color: var(--accent);
  font-size: 25px;
  padding: 0 5px;
  vertical-align: -1px;
}
.footer-actions {
  display: flex;
  gap: 14px;
}
.footer-actions .el-icon {
  margin-right: 9px;
  font-size: 19px;
}
.file-input {
  display: none;
}
.drop-area {
  border: 1px dashed var(--input-stroke);
  border-radius: 10px;
  padding: 30px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  text-align: center;
}
.drop-area > .el-icon {
  font-size: 34px;
  color: var(--accent);
}
.drop-area p {
  color: var(--muted);
  font-size: 12px;
}
.drop-area > div {
  display: flex;
  gap: 10px;
  margin-top: 7px;
}
.note-media {
  flex-wrap: wrap;
}
.note-image {
  width: 100px;
  height: 110px;
  position: relative;
}
.note-image > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
}
.note-image > span {
  position: absolute;
  bottom: 5px;
  left: 6px;
  font-size: 10px;
  background: rgba(0, 0, 0, 0.6);
  padding: 1px 6px;
  border-radius: 4px;
}
.remove-note {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border-radius: 4px;
  padding: 2px;
  display: flex;
}
.missing-note {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--muted);
  border: 1px dashed var(--input-stroke);
  border-radius: 6px;
  font-size: 10px;
}
.missing-note .el-icon {
  font-size: 24px;
  color: var(--accent);
}
.add-note {
  width: 60px;
  height: 80px;
  border: 1px dashed var(--input-stroke);
  border-radius: 6px;
  color: var(--accent);
  font-size: 24px;
}
.article-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.article-preview {
  font-size: 12px;
  line-height: 1.9;
  color: var(--secondary);
  padding-top: 15px;
  overflow-wrap: anywhere;
}
.article-preview :deep(h1),
.article-preview :deep(h2) {
  font-size: 17px;
  line-height: 1.6;
  margin: 12px 0;
  color: var(--text);
}
.article-preview :deep(p) {
  margin: 8px 0;
}
.article-preview :deep(img) {
  max-width: 100%;
}
.picker-search {
  display: flex;
  gap: 20px;
  align-items: center;
  margin-bottom: 17px;
}
.picker-search .text-muted {
  white-space: nowrap;
  font-size: 12px;
  flex-shrink: 0;
}
.picker-search :deep(.el-input) {
  flex: 1;
  width: 0;
  min-width: 0;
}
.platform-filter {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--stroke);
}
.platform-filter button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border-radius: 6px;
  color: var(--secondary);
  font-size: 12px;
}
.platform-filter button.active {
  color: var(--accent);
  background: var(--accent-soft);
}
.picker-accounts {
  max-height: 330px;
  overflow-y: auto;
  margin-bottom: 15px;
}
.picker-account {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 5px;
  border-bottom: 1px solid var(--stroke);
}
.picker-account :deep(.el-checkbox__label) {
  display: flex;
  align-items: center;
  gap: 12px;
}
.picker-account small {
  display: block;
  color: var(--muted);
  font-size: 11px;
  margin-top: 4px;
}
.override-account {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.override-account + p {
  margin-bottom: 24px;
}
.library-list button {
  display: flex;
  width: 100%;
  align-items: center;
  padding: 14px 5px;
  gap: 15px;
  border-bottom: 1px solid var(--stroke);
  text-align: left;
}
.library-list img {
  width: 76px;
  height: 48px;
  object-fit: cover;
  border-radius: 5px;
}
.library-list button > span {
  flex: 1;
}
.library-list strong,
.library-list small {
  display: block;
}
.library-list small {
  color: var(--muted);
  margin-top: 5px;
}
.full-media-preview {
  width: 100%;
  max-height: 65vh;
  object-fit: contain;
  margin-bottom: 12px;
}
@media (min-width: 1351px) {
  .composer-grid {
    grid-template-columns: minmax(0, 1fr) 395px;
  }
  .content-modes button {
    min-width: 144px;
    height: 46px;
    font-size: 19px;
  }
  .media-thumbnail {
    width: 204px;
    height: 118px;
  }
  .imported-media {
    min-height: 143px;
  }
  .media-info strong {
    font-size: 20px;
  }
  .media-info p {
    font-size: 16px;
  }
  .field > label,
  .article-label > label {
    font-size: 19px;
  }
  .field :deep(.el-input__inner),
  .field :deep(.el-textarea__inner) {
    font-size: 18px;
  }
  .field :deep(.el-input__wrapper) {
    min-height: 45px;
  }
  .field :deep(.el-input__count) {
    font-size: 12px;
  }
  .topic-tag,
  .add-tag {
    font-size: 15px;
  }
  .override-toggle strong {
    font-size: 18px;
  }
  .scope-label {
    font-size: 12px;
  }
  .override-description {
    font-size: 13px;
  }
  .destinations h2,
  .preview-heading h2 {
    font-size: 22px;
  }
  .destination-row {
    min-height: 64px;
  }
  .account-avatar {
    width: 34px;
    height: 34px;
  }
  .destination-name {
    font-size: 14px;
  }
  .destination-row .status-pill {
    font-size: 11px;
  }
  .add-destination {
    font-size: 17px;
  }
  .preview-copy h3 {
    font-size: 20px;
  }
  .preview-copy > p {
    font-size: 15px;
  }
  .preview-tags span {
    font-size: 12px;
  }
  .schedule-field :deep(.el-radio__label) {
    font-size: 18px;
  }
  .task-count {
    font-size: 19px;
  }
  .task-count strong {
    font-size: 29px;
  }
  .footer-actions .el-button {
    height: 52px;
    font-size: 18px;
    padding-inline: 26px;
  }
  .footer-actions .el-icon {
    font-size: 23px;
  }
  .composer-footer {
    padding-block: 25px;
  }
  .preview-media-button {
    width: 35px;
  }
  .replace-media {
    font-size: 11px;
  }
}
@media (max-width: 1350px) {
  .composer-grid {
    grid-template-columns: minmax(0, 1fr) 310px;
    gap: 24px;
    padding-left: 28px;
  }
  .composer-aside {
    padding-left: 22px;
  }
  .media-thumbnail {
    width: 155px;
    height: 100px;
  }
  .imported-media {
    gap: 13px;
    min-height: 125px;
  }
  .media-info strong {
    font-size: 15px;
  }
  .content-modes button {
    min-width: 112px;
  }
  .account-avatar {
    display: none;
  }
  .override-description {
    font-size: 11px;
  }
  .preview-media-button {
    display: none;
  }
}
@media (max-width: 900px) {
  .composer-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .composer-aside {
    border-left: 0;
    border-top: 1px solid var(--stroke);
    padding: 24px 0 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
  .preview-section {
    border-top: 0;
    padding-top: 0;
    margin-top: 0;
  }
  .destination-name {
    font-size: 11px;
  }
  .task-count {
    font-size: 13px;
  }
  .footer-actions {
    gap: 8px;
  }
  .footer-actions .el-button {
    font-size: 12px;
    padding-left: 12px;
    padding-right: 12px;
  }
  .composer-footer {
    padding: 16px 20px;
  }
  .content-modes button {
    flex: 1;
    min-width: 0;
  }
}
@media (max-width: 600px) {
  .composer-grid {
    padding-inline: 18px;
  }
  .composer-aside {
    grid-template-columns: 1fr;
  }
  .media-thumbnail {
    width: 110px;
    height: 78px;
  }
  .imported-media {
    gap: 10px;
    min-height: 103px;
  }
  .media-info strong {
    font-size: 12px;
  }
  .media-info p {
    font-size: 11px;
  }
  .composer-footer {
    flex-wrap: wrap;
    gap: 9px;
  }
  .footer-actions {
    width: 100%;
  }
  .footer-actions .el-button {
    flex: 1;
  }
  .override-description {
    display: none;
  }
  .override-toggle {
    gap: 6px;
  }
  .override-toggle strong {
    font-size: 13px;
  }
  .topic-tag {
    font-size: 11px;
  }
  .page-head h1 {
    font-size: 24px;
  }
}
</style>
