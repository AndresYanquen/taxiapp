import axios, { type AxiosInstance } from 'axios'
import { handleTokenExpiryIfNeeded } from '@/utils/tokenExpiration'

type TokenProvider = () => string | null

let apiClient: AxiosInstance | null = null
let tokenProvider: TokenProvider = () => {
  try {
    const storedUser = localStorage.getItem('user')
    if (!storedUser) return null
    const parsed = JSON.parse(storedUser)
    return parsed?.token ?? null
  } catch {
    return null
  }
}

const createApiClient = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_URL,
    timeout: 20000,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  instance.interceptors.request.use(
    (config) => {
      const token = tokenProvider()
      if (token) {
        config.headers = config.headers ?? {}
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    },
    (error) => Promise.reject(error),
  )

  instance.interceptors.response.use(
    (response) => {
      handleTokenExpiryIfNeeded(response.data)
      return response
    },
    (error) => {
      if (error?.response) {
        handleTokenExpiryIfNeeded(error.response.data)
      }
      return Promise.reject(error)
    },
  )

  return instance
}

export const registerTokenProvider = (provider: TokenProvider) => {
  tokenProvider = provider
}

export const useApi = (): AxiosInstance => {
  if (!apiClient) {
    apiClient = createApiClient()
  }
  return apiClient
}
