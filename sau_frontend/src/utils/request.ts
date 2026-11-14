import axios from 'axios'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { ElMessage } from 'element-plus'
import type { ApiResponse } from '@/types/studio'
export interface RequestOptions extends AxiosRequestConfig {
  silent?: boolean
}
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
})
request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = 'Bearer ' + token
  return config
})
request.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && !(error.config as RequestOptions | undefined)?.silent)
      ElMessage.error(
        error.response?.status === 401 ? '请重新连接账号。' : '本地服务暂时不可用，请稍后重试。',
      )
    return Promise.reject(error)
  },
)
function unwrap<T>(promise: Promise<AxiosResponse<ApiResponse<T>>>): Promise<ApiResponse<T>> {
  return promise.then((response) => {
    if (response.data.code === 200 || response.data.success) return response.data
    const message = response.data.msg || response.data.message || '请求失败'
    if (!(response.config as RequestOptions).silent) ElMessage.error(message)
    throw new Error(message)
  })
}
export const http = {
  get<T = unknown>(url: string, params?: unknown, config: RequestOptions = {}) {
    return unwrap(request.get<ApiResponse<T>>(url, { params, ...config }))
  },
  post<T = unknown>(url: string, data?: unknown, config: RequestOptions = {}) {
    return unwrap(request.post<ApiResponse<T>>(url, data, config))
  },
  put<T = unknown>(url: string, data?: unknown, config: RequestOptions = {}) {
    return unwrap(request.put<ApiResponse<T>>(url, data, config))
  },
  delete<T = unknown>(url: string, params?: unknown) {
    return unwrap(request.delete<ApiResponse<T>>(url, { params }))
  },
  upload<T = unknown>(
    url: string,
    data: FormData,
    onUploadProgress?: AxiosRequestConfig['onUploadProgress'],
  ) {
    return unwrap(
      request.post<ApiResponse<T>>(url, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress,
      }),
    )
  },
}
export default request
