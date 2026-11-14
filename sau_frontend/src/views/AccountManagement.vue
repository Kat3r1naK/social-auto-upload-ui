<template>
  <section class="route-page">
    <header class="page-head">
      <div>
        <div class="title-line">
          <h1>账号管理</h1>
          <span v-if="studio.mode === 'demo'" class="sample-label">示例账号</span>
        </div>
        <p>把不同平台的创作身份，放在一个地方管理。</p>
      </div>
      <div class="head-actions">
        <el-button v-if="studio.mode === 'live'" :loading="checking" @click="checkAccounts"
          ><el-icon><Refresh /></el-icon>检查登录状态</el-button
        ><el-button type="primary" @click="openAdd"
          ><el-icon><Plus /></el-icon
          >{{ studio.mode === 'demo' ? '添加示例账号' : '授权账号' }}</el-button
        >
      </div>
    </header>
    <div class="page-scroll">
      <div v-if="studio.desktop && studio.mode === 'live'" class="notice">
        <el-icon><InfoFilled /></el-icon><span>已有原项目的登录会话，可以导入后重新检查账号。</span
        ><el-button text @click="importAccounts">导入原项目账号</el-button>
      </div>
      <div v-if="studio.mode === 'demo'" class="notice">
        <el-icon><InfoFilled /></el-icon
        ><span
          >这里的账号为虚构示例。可以添加任意已支持内容类型的示例账号，体验多平台分发流程。</span
        >
      </div>
      <div v-else-if="studio.connectionError" class="notice">
        <el-icon><Warning /></el-icon><span>{{ studio.connectionError }}</span
        ><button class="text-button" @click="studio.refreshData()">重试</button>
      </div>
      <div class="toolbar">
        <el-input
          v-model="query"
          placeholder="搜索账号名称或分组"
          prefix-icon="Search"
          clearable
        /><el-select v-model="platformFilter" style="width: 180px"
          ><el-option label="全部平台" value="all" /><el-option
            v-for="platform in platforms"
            :key="platform.id"
            :label="platform.name"
            :value="platform.id" /></el-select
        ><el-select v-model="statusFilter" style="width: 150px"
          ><el-option label="全部状态" value="all" /><el-option
            label="已登录"
            value="valid" /><el-option label="需要登录" value="expired" /></el-select
        ><span class="account-count">{{ filtered.length }} 个账号</span>
      </div>
      <div v-if="filtered.length" class="accounts-grid">
        <article v-for="account in filtered" :key="account.id" class="account-card">
          <div class="account-card-head">
            <PlatformBadge :id="account.platformId" /><span>{{
              getPlatform(account.platformId)?.name
            }}</span
            ><el-dropdown trigger="click"
              ><button class="icon-button" :aria-label="account.name + ' 的更多操作'">
                <el-icon><MoreFilled /></el-icon></button
              ><template #dropdown
                ><el-dropdown-menu
                  ><el-dropdown-item @click="editAccount(account)">编辑账号</el-dropdown-item
                  ><el-dropdown-item @click="removeAccount(account)"
                    >解除本地绑定</el-dropdown-item
                  ></el-dropdown-menu
                ></template
              ></el-dropdown
            >
          </div>
          <div class="account-identity">
            <AccountAvatar :account="account" :demo="studio.mode === 'demo'" />
            <div>
              <h2>{{ account.name }}</h2>
              <p>{{ account.group || '未分组' }}</p>
            </div>
          </div>
          <div class="account-card-footer">
            <span class="status-pill" :class="account.status"
              ><span
                class="status-dot"
                :class="account.status === 'valid' ? 'green' : 'amber'"
              ></span
              >{{
                account.status === 'valid'
                  ? '已登录'
                  : account.status === 'checking'
                    ? '验证中'
                    : account.status === 'unverified'
                      ? '尚未验证'
                      : '需要重新登录'
              }}</span
            ><button
              class="text-button"
              @click="studio.mode === 'demo' ? editAccount(account) : relogin(account)"
            >
              {{ studio.mode === 'demo' ? '编辑账号' : '重新登录'
              }}<el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </article>
        <button class="add-account-card" @click="openAdd">
          <el-icon><Plus /></el-icon><span>添加一个创作账号</span
          ><small>连接更多平台，分享更多可能</small>
        </button>
      </div>
      <div v-else class="empty-state">
        <el-icon><User /></el-icon>
        <h2>
          {{ query || platformFilter !== 'all' ? '没有找到这个账号' : '连接你的第一个创作账号' }}
        </h2>
        <p>登录会话保留在本机，发布前可以随时检查状态。</p>
        <el-button type="primary" @click="openAdd">{{
          studio.mode === 'demo' ? '添加示例账号' : '授权账号'
        }}</el-button>
      </div>
    </div>
    <el-dialog
      v-model="dialogOpen"
      :title="
        dialogIntent === 'edit' ? '编辑账号' : studio.mode === 'demo' ? '添加示例账号' : '授权账号'
      "
      width="540px"
      @closed="closeLogin"
      ><el-form label-position="top"
        ><el-form-item label="平台"
          ><el-select
            v-model="accountForm.platformId"
            :disabled="editingId !== undefined || loginBusy"
            filterable
            style="width: 100%"
            ><el-option
              v-for="platform in platforms"
              :key="platform.id"
              :label="platform.name"
              :value="platform.id" /></el-select></el-form-item
        ><el-form-item label="账号别名"
          ><el-input
            v-model="accountForm.name"
            placeholder="例如：山野日记"
            maxlength="40"
            :disabled="loginBusy" /></el-form-item
        ><el-form-item v-if="studio.mode === 'demo' || studio.desktop" label="分组"
          ><el-input
            v-model="accountForm.group"
            placeholder="例如：个人创作"
            maxlength="40"
            :disabled="loginBusy" /></el-form-item
      ></el-form>
      <div v-if="studio.mode === 'demo'" class="dialog-hint">
        将添加到示例工作区，不会打开登录窗口或保存真实账号信息。
      </div>
      <div v-else-if="studio.desktop && dialogIntent === 'connect'" class="dialog-hint">
        点击“授权登录”后，在打开的平台浏览器中完成扫码或登录；Bilibili
        会在此显示二维码。登录会话仅保存在本机，完成后才会显示为已登录。
      </div>
      <div
        v-else-if="!studio.desktop && !getPlatform(accountForm.platformId)?.legacyType"
        class="notice"
      >
        <el-icon><InfoFilled /></el-icon
        ><span>该平台的登录界面已预留，将随新版客户端服务接入。</span>
      </div>
      <div v-if="loginBusy || loginMessage" class="login-status">
        <el-image
          v-if="qrCode"
          :src="qrCode"
          alt="使用对应平台 App 扫描此二维码登录"
          style="width: 220px; height: 220px"
          ><template #error><span>正在准备登录二维码…</span></template></el-image
        ><el-icon v-else-if="loginBusy" class="is-loading"><Loading /></el-icon>
        <p>{{ loginMessage || '正在准备登录，请稍候…' }}</p>
      </div>
      <template #footer
        ><el-button @click="dialogOpen = false">关闭</el-button
        ><el-button
          v-if="!loginBusy"
          type="primary"
          :disabled="
            studio.mode === 'live' &&
            !studio.desktop &&
            !getPlatform(accountForm.platformId)?.legacyType
          "
          @click="saveAccount"
          >{{
            studio.mode === 'demo' || dialogIntent === 'edit' ? '保存账号' : '授权登录'
          }}</el-button
        ></template
      ></el-dialog
    >
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useStudioStore } from '@/stores/studio'
import { getPlatform, platforms } from '@/config/platforms'
import { http } from '@/utils/request'
import type { Account, AccountId, LegacyAccountRow } from '@/types/studio'
import PlatformBadge from '@/components/PlatformBadge.vue'
import AccountAvatar from '@/components/AccountAvatar.vue'
const studio = useStudioStore(),
  query = ref(''),
  platformFilter = ref('all'),
  statusFilter = ref('all'),
  dialogOpen = ref(false),
  checking = ref(false)
async function importAccounts() {
  try {
    const count = await window.sauDesktop!.importAccounts()
    await studio.refreshData()
    ElMessage.success('已导入 ' + count + ' 个账号，请检查登录状态。')
  } catch (error) {
    ElMessage.error(String(error))
  }
}
const accountForm = reactive({ platformId: 'douyin', name: '', group: '' }),
  editingId = ref<AccountId>(),
  dialogIntent = ref<'connect' | 'edit'>('connect')
const qrCode = ref(''),
  loginMessage = ref(''),
  loginBusy = ref(false)
let loginSource: EventSource | undefined, loginTimeout: ReturnType<typeof setTimeout> | undefined
const filtered = computed(() =>
  studio.accounts.filter(
    (account) =>
      (platformFilter.value === 'all' || account.platformId === platformFilter.value) &&
      (statusFilter.value === 'all' || account.status === statusFilter.value) &&
      (account.name + account.group).toLowerCase().includes(query.value.toLowerCase()),
  ),
)
function closeLogin() {
  loginSource?.close()
  loginSource = undefined
  if (loginTimeout) clearTimeout(loginTimeout)
  loginBusy.value = false
}
function openAdd() {
  closeLogin()
  dialogIntent.value = 'connect'
  editingId.value = undefined
  Object.assign(accountForm, { platformId: 'douyin', name: '', group: '' })
  qrCode.value = ''
  loginMessage.value = ''
  dialogOpen.value = true
}
function editAccount(account: Account) {
  closeLogin()
  dialogIntent.value = 'edit'
  editingId.value = account.id
  Object.assign(accountForm, {
    platformId: account.platformId,
    name: account.name,
    group: account.group,
  })
  qrCode.value = ''
  loginMessage.value = ''
  dialogOpen.value = true
}
async function beginLogin() {
  if (studio.desktop) {
    if (!accountForm.name.trim()) return
    closeLogin()
    loginBusy.value = true
    loginMessage.value = '正在打开平台登录窗口，请在浏览器中完成登录。'
    try {
      const account = await window.sauDesktop!.saveAccount({
        id: editingId.value === undefined ? undefined : String(editingId.value),
        ...accountForm,
      })
      editingId.value = account.id
      if (account.platformId === 'bilibili') {
        const refreshQr = () => {
          if (loginBusy.value) {
            qrCode.value = 'sau-media://login/' + account.id + '?v=' + Date.now()
            loginTimeout = setTimeout(refreshQr, 2000)
          }
        }
        refreshQr()
      }
      await window.sauDesktop!.accountAction(String(account.id), 'login')
      await studio.refreshData()
      const updated = studio.accounts.find((item) => item.id === account.id)
      loginMessage.value = updated?.message || '账号操作已结束。'
      if (updated?.status === 'valid') {
        ElMessage.success('账号已连接。')
        dialogOpen.value = false
      }
    } catch (error) {
      loginMessage.value = String(error)
    } finally {
      closeLogin()
      qrCode.value = ''
    }
    return
  }
  const type = getPlatform(accountForm.platformId)?.legacyType
  if (!type || !accountForm.name.trim()) return
  closeLogin()
  loginBusy.value = true
  qrCode.value = ''
  loginMessage.value = '正在准备登录窗口和二维码…'
  loginSource = new EventSource(
    (import.meta.env.VITE_API_BASE_URL || '/api') +
      '/login?type=' +
      type +
      '&id=' +
      encodeURIComponent(accountForm.name.trim()),
  )
  loginTimeout = setTimeout(() => {
    closeLogin()
    loginMessage.value = '等待登录超时，可以关闭后重新尝试。'
  }, 180000)
  loginSource.onmessage = (event: MessageEvent<string>) => {
    const value = event.data
    if (value === '200') {
      closeLogin()
      loginMessage.value = '登录完成，正在刷新账号。'
      void studio.refreshData()
      ElMessage.success('账号登录完成。')
      dialogOpen.value = false
    } else if (value === '500') {
      closeLogin()
      loginMessage.value = '本次登录未完成，请重新尝试。'
    } else if (
      value.startsWith('data:image/') ||
      (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 100)
    ) {
      qrCode.value = value.startsWith('data:image/') ? value : 'data:image/png;base64,' + value
      loginMessage.value = '请使用对应平台 App 扫码，或在打开的浏览器中完成登录。'
    }
  }
  loginSource.onerror = () => {
    closeLogin()
    loginMessage.value = '登录连接已断开，请检查本地服务后重试。'
  }
}
async function saveAccount() {
  if (!accountForm.name.trim()) {
    ElMessage.warning('请填写一个账号别名。')
    return
  }
  if (studio.mode === 'demo') {
    const existing = studio.sampleAccounts.find((account) => account.id === editingId.value)
    if (existing)
      Object.assign(existing, { name: accountForm.name.trim(), group: accountForm.group.trim() })
    else
      studio.sampleAccounts.push({
        id: crypto.randomUUID(),
        platformId: accountForm.platformId,
        name: accountForm.name.trim(),
        group: accountForm.group.trim(),
        status: 'valid',
      })
    dialogOpen.value = false
    ElMessage.success('示例账号已保存。')
  } else if (dialogIntent.value === 'connect') {
    await beginLogin()
  } else if (studio.desktop && editingId.value !== undefined) {
    try {
      await window.sauDesktop!.saveAccount({ id: String(editingId.value), ...accountForm })
      await studio.refreshData()
      dialogOpen.value = false
      ElMessage.success('账号已保存。')
    } catch (error) {
      ElMessage.error(String(error))
    }
  } else if (editingId.value !== undefined) {
    try {
      await http.post('/updateUserinfo', {
        id: editingId.value,
        type: getPlatform(accountForm.platformId)?.legacyType,
        userName: accountForm.name.trim(),
      })
      await studio.refreshData()
      dialogOpen.value = false
    } catch {
      /* API already presents the request error. */
    }
  } else beginLogin()
}
function relogin(account: Account) {
  openAdd()
  Object.assign(accountForm, {
    platformId: account.platformId,
    name: account.name,
    group: account.group,
  })
  if (studio.desktop) editingId.value = account.id
  beginLogin()
}
async function checkAccounts() {
  checking.value = true
  try {
    if (studio.desktop) {
      for (const account of studio.liveAccounts)
        await window.sauDesktop!.accountAction(String(account.id), 'check')
      await studio.refreshData()
      ElMessage.success('账号检查完成，请查看各账号状态。')
      return
    }
    const result = await http.get<LegacyAccountRow[]>('/getValidAccounts')
    studio.liveAccounts = result.data.map(studio.normalizeAccount)
    ElMessage.success('账号状态已更新。')
  } catch (error) {
    if (studio.desktop) ElMessage.error(String(error))
  } finally {
    checking.value = false
  }
}
async function removeAccount(account: Account) {
  try {
    await ElMessageBox.confirm(
      '解除「' + account.name + '」的本地绑定？这不会删除平台账号。',
      '解除本地绑定',
      { confirmButtonText: '解除绑定', cancelButtonText: '保留' },
    )
    if (studio.mode === 'demo')
      studio.sampleAccounts = studio.sampleAccounts.filter((item) => item.id !== account.id)
    else {
      if (studio.desktop) await window.sauDesktop!.removeAccount(String(account.id))
      else await http.get('/deleteAccount', { id: account.id })
      await studio.refreshData()
    }
  } catch (error) {
    if (studio.desktop && error !== 'cancel' && error !== 'close') ElMessage.error(String(error))
  }
}
onBeforeUnmount(closeLogin)
</script>
<style scoped>
.account-count {
  margin-left: auto;
  color: var(--muted);
  font-size: 12px;
}
.accounts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
}
.account-card {
  background: var(--surface);
  border: 1px solid var(--stroke);
  border-radius: 11px;
  padding: 18px 21px 15px;
}
.account-card-head {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--secondary);
  font-size: 12px;
}
.account-card-head .el-dropdown {
  margin-left: auto;
}
.account-identity {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 25px 0 27px;
}
.account-identity h2 {
  font-size: 18px;
  font-weight: 550;
}
.account-identity p {
  font-size: 12px;
  color: var(--muted);
  margin-top: 5px;
}
.account-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px solid var(--stroke);
}
.account-card-footer .text-button {
  font-size: 12px;
}
.add-account-card {
  min-height: 224px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--input-stroke);
  border-radius: 11px;
  gap: 13px;
  color: var(--secondary);
}
.add-account-card:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--surface);
}
.add-account-card .el-icon {
  font-size: 27px;
}
.add-account-card small {
  color: var(--muted);
  font-size: 11px;
}
.login-status {
  text-align: center;
  padding: 20px 5px;
  color: var(--secondary);
}
.login-status img {
  width: 220px;
  height: 220px;
  object-fit: contain;
  background: white;
  border-radius: 8px;
  padding: 8px;
  margin: 0 auto 15px;
}
.login-status p {
  font-size: 12px;
  line-height: 1.8;
}
.login-status .el-icon {
  font-size: 28px;
  margin-bottom: 15px;
  color: var(--accent);
}
</style>
