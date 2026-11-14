import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LegacyAccountRow } from '@/types/studio'
interface LegacyAccount {
  id: number
  type: number
  filePath: string
  name: string
  status: string
  platform: string
}

export const useAccountStore = defineStore('account', () => {
  // 存储所有账号信息
  const accounts = ref<LegacyAccount[]>([])

  // 平台类型映射
  const platformTypes: Record<number, string> = {
    1: '小红书',
    2: '视频号',
    3: '抖音',
    4: '快手',
  }

  // 设置账号列表
  const setAccounts = (accountsData: LegacyAccountRow[]) => {
    // 转换后端返回的数据格式为前端使用的格式
    accounts.value = accountsData.map((item) => {
      return {
        id: item[0],
        type: item[1],
        filePath: item[2],
        name: item[3],
        status: item[4] === -1 ? '验证中' : item[4] === 1 ? '正常' : '异常',
        platform: platformTypes[item[1]] || '未知',
      }
    })
  }

  // 添加账号
  const addAccount = (account: LegacyAccount) => {
    accounts.value.push(account)
  }

  // 更新账号
  const updateAccount = (id: number, updatedAccount: Partial<LegacyAccount>) => {
    const index = accounts.value.findIndex((acc) => acc.id === id)
    if (index !== -1) {
      accounts.value[index] = { ...accounts.value[index], ...updatedAccount }
    }
  }

  // 删除账号
  const deleteAccount = (id: number) => {
    accounts.value = accounts.value.filter((acc) => acc.id !== id)
  }

  // 根据平台获取账号
  const getAccountsByPlatform = (platform: string) => {
    return accounts.value.filter((acc) => acc.platform === platform)
  }

  return {
    accounts,
    setAccounts,
    addAccount,
    updateAccount,
    deleteAccount,
    getAccountsByPlatform,
  }
})
