import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApi, registerTokenProvider } from '@/composables/useApi'
import { handleTokenExpiryIfNeeded, resetTokenExpiryHandling } from '@/utils/tokenExpiration'

// Define the structure of the user object we'll store
interface User {
  token: string | null
  role: 'user' | 'driver' | null
}

// Define your store
export const useAuthStore = defineStore('auth', () => {
  const router = useRouter()

  // --- STATE ---
  // Initialize state from localStorage to keep the user logged in across page refreshes
  const user = ref<User>(
    JSON.parse(localStorage.getItem('user') || 'null') || { token: null, role: null },
  )

  type BufferLike = {
    from: (input: string, encoding: string) => { toString: (encoding: string) => string }
  }

  const TOKEN_EXPIRATION_PAYLOAD = {
    error: 'Token no válido o expirado.',
    detalle: {
      reason: 'jwt expired',
    },
  } as const

  const normalizeBase64 = (segment: string) => {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4
    if (padding === 0) return normalized
    return normalized + '='.repeat(4 - padding)
  }

  const decodeBase64 = (segment: string) => {
    const normalized = normalizeBase64(segment)
    if (typeof globalThis.atob === 'function') {
      return globalThis.atob(normalized)
    }
    const bufferCtor = (globalThis as typeof globalThis & { Buffer?: BufferLike }).Buffer
    if (bufferCtor) {
      return bufferCtor.from(normalized, 'base64').toString('utf-8')
    }
    return ''
  }

  const decodeJwtPayload = (token: string) => {
    try {
      const [, payload] = token.split('.')
      if (!payload) return null
      const decoded = decodeBase64(payload)
      if (!decoded) return null
      return JSON.parse(decoded) as { exp?: number }
    } catch {
      return null
    }
  }

  const isTokenExpired = (token: string) => {
    const payload = decodeJwtPayload(token)
    if (!payload?.exp) return false
    return payload.exp * 1000 < Date.now()
  }

  const clearStoredSession = () => {
    user.value = { token: null, role: null }
    localStorage.removeItem('user')
  }

  const handleExpiredSession = () => {
    clearStoredSession()
    handleTokenExpiryIfNeeded(TOKEN_EXPIRATION_PAYLOAD)
  }

  const getValidToken = (): string | null => {
    const token = user.value?.token
    if (!token) {
      return null
    }
    if (isTokenExpired(token)) {
      handleExpiredSession()
      return null
    }
    return token
  }

  if (user.value?.token) {
    getValidToken()
  }

  const authToken = computed(() => getValidToken())
  const isAuthenticated = computed(() => !!authToken.value)
  const userRole = computed(() => (authToken.value ? user.value?.role : null))
  const currentUser = computed(() => user.value)

  // Share the latest token with the API composable so it can inject auth headers.
  registerTokenProvider(() => authToken.value || null)

  const api = useApi()

  // --- ACTIONS ---

  /**
   * Handles the user login process.
   * @param {string} email - The user's email.
   * @param {string} password - The user's password.
   */
  async function login(email, password) {
    try {
      const response = await api.post(`${import.meta.env.VITE_BACKEND_URL}/api/auth/login`, {
        // Adjust URL if needed
        email,
        password,
      })

      // Extract token and role from the successful response
      const { token, role } = response.data

      // Update the state
      user.value = { token, role }

      // Store user details in localStorage to persist session
      localStorage.setItem('user', JSON.stringify(user.value))
      resetTokenExpiryHandling()

      // Redirect user to the appropriate dashboard based on their role
      if (role === 'driver') {
        router.push('/driver')
      } else {
        router.push('/request-ride') // Default to rider dashboard
      }
    } catch (error) {
      console.error('Login failed:', error)
      if (error?.response?.data) {
        handleTokenExpiryIfNeeded(error.response.data)
      }
      const normalizedError =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'Ocurrió un error al iniciar sesión. Por favor, inténtalo de nuevo.'
      throw { error: normalizedError }
    }
  }

  function saveTokenOnSignUp({ token, role }) {
    user.value = { token, role }
    localStorage.setItem('user', JSON.stringify(user.value))
    resetTokenExpiryHandling()
  }

  /**
   * Logs the user out.
   */
  function logout() {
    clearStoredSession()
    resetTokenExpiryHandling()
    router.push('/login')
  }

  return {
    user,
    isAuthenticated,
    authToken,
    userRole,
    login,
    saveTokenOnSignUp,
    logout,
    currentUser,
  }
})
