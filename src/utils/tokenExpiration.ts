import router from '@/router'

const TOKEN_ERROR_MESSAGE = 'Token no válido o expirado.'
const TOKEN_ERROR_REASON = 'jwt expired'

interface TokenExpiredResponse {
  error: string
  detalle?: {
    reason?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

let hasHandledTokenExpiry = false
let redirectPromise: Promise<void> | null = null

const isExpiredTokenPayload = (payload: unknown): payload is TokenExpiredResponse => {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const data = payload as Record<string, unknown>
  const detalle = data.detalle as Record<string, unknown> | undefined

  return data.error === TOKEN_ERROR_MESSAGE && detalle?.reason === TOKEN_ERROR_REASON
}

const redirectToLogin = () => {
  if (hasHandledTokenExpiry) {
    return
  }

  hasHandledTokenExpiry = true
  redirectPromise = (async () => {
    try {
      await router.push({ name: 'login' })
      window.alert('Tu sesión ha expirado. Por favor inicia sesión nuevamente.')
    } catch {
      // Ignore navigation failures (e.g., already on login)
    }
  })()
}

export const handleTokenExpiryIfNeeded = (payload: unknown): boolean => {
  if (!isExpiredTokenPayload(payload)) {
    return false
  }

  redirectToLogin()
  return true
}

export const resetTokenExpiryHandling = () => {
  hasHandledTokenExpiry = false
  redirectPromise = null
}
