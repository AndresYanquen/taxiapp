<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { ref, onMounted } from 'vue' // 👈 1. Import onMounted
import { useAuthStore } from '@/stores/auth.store'

// --- State ---
const email = ref('')
const password = ref('')
const errorMessage = ref<string | null>(null) // To display login errors
const isLoading = ref(false)

// --- Store and Router ---
const authStore = useAuthStore()
const router = useRouter()

// --- Lifecycle Hook ---
// 👇 2. Add the onMounted hook to check for an existing session
onMounted(() => {
  // If the user is already authenticated, redirect them away from the login page
  console.log('authStore.isAuthenticated', authStore.isAuthenticated)
  if (authStore.isAuthenticated) {
    console.log('User is already authenticated. Redirecting...')
    if (authStore.userRole === 'driver') {
      router.push('/driver')
    } else {
      router.push('/request-ride')
    }
  }
})

// --- Functions ---
const handleLogin = async () => {
  // Basic validation
  if (!email.value || !password.value) {
    errorMessage.value = 'Please fill in both fields.'
    return
  }

  isLoading.value = true
  errorMessage.value = null

  try {
    // Call the login action from your Pinia store
    await authStore.login(email.value, password.value)

    // The store will handle the redirect on success.
  } catch (error: any) {
    if (error && error.error) {
      errorMessage.value = error.error
    } else if (error.response?.data?.error) {
      errorMessage.value = error.response.data.error
    } else {
      errorMessage.value = 'An unexpected error occurred. Please try again.'
    }
    console.error('Login component error:', error)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-gray-100 px-6 py-16 flex items-center justify-center">
    <div class="w-full max-w-5xl grid gap-12 lg:grid-cols-2 items-center">
      <div class="space-y-6 text-center lg:text-left">
        <RouterLink to="/" class="inline-flex items-center text-3xl font-bold text-white">
          <i class="fa-solid fa-car-side text-emerald-400 mr-3"></i
          >{{ $t('app.name') || 'SwiftRide' }}
        </RouterLink>
        <div class="space-y-4">
          <h1 class="text-4xl font-black leading-tight">{{ $t('login.hero.title') }}</h1>
          <p class="text-gray-400 text-lg max-w-lg mx-auto lg:mx-0">
            {{ $t('login.hero.description') }}
          </p>
        </div>
        <div class="hidden lg:flex items-center gap-6 text-sm text-gray-400">
          <div class="flex items-center gap-3">
            <span
              class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"
            >
              <i class="fa-solid fa-lock"></i>
            </span>
            {{ $t('login.hero.feature.security') }}
          </div>
          <div class="flex items-center gap-3">
            <span
              class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"
            >
              <i class="fa-solid fa-headset"></i>
            </span>
            {{ $t('login.hero.feature.support') }}
          </div>
        </div>
      </div>

      <div
        class="bg-gray-900/60 border border-gray-800 rounded-3xl p-8 shadow-[0_25px_70px_-35px_rgba(16,185,129,0.45)] backdrop-blur"
      >
        <div class="text-center space-y-2">
          <h2 class="text-2xl font-bold text-white">{{ $t('login.form.title') }}</h2>
          <p class="text-sm text-gray-400">{{ $t('login.form.subtitle') }}</p>
        </div>

        <div
          v-if="errorMessage"
          class="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {{ errorMessage }}
        </div>

        <form class="mt-8 space-y-6" @submit.prevent="handleLogin">
          <div class="space-y-4">
            <div>
              <label for="email-address" class="sr-only">{{ $t('login.form.emailLabel') }}</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autocomplete="email"
                required
                v-model="email"
                class="block w-full rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 text-gray-100 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                :placeholder="$t('login.form.emailPlaceholder')"
              />
            </div>
            <div>
              <label for="password" class="sr-only">{{ $t('login.form.passwordLabel') }}</label>
              <input
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                required
                v-model="password"
                class="block w-full rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 text-gray-100 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                :placeholder="$t('login.form.passwordPlaceholder')"
              />
            </div>
          </div>

          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-sm">
            <label class="inline-flex items-center gap-2 text-gray-400">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                class="h-4 w-4 rounded border-gray-700 bg-gray-900 text-emerald-500 focus:ring-emerald-500"
              />
              {{ $t('login.form.remember') }}
            </label>

            <a href="#" class="text-emerald-400 hover:text-emerald-300 transition">
              {{ $t('login.form.forgot') }}
            </a>
          </div>

          <button
            type="submit"
            :disabled="isLoading"
            class="group relative flex w-full items-center justify-center gap-3 rounded-2xl border border-transparent bg-emerald-500 px-6 py-3 font-semibold uppercase tracking-wide text-gray-900 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
          >
            <svg
              v-if="isLoading"
              class="h-5 w-5 animate-spin text-gray-900"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            {{ isLoading ? $t('login.loading') : $t('login') }}
          </button>
        </form>

        <p class="mt-8 text-center text-sm text-gray-400">
          {{ $t('login.form.noAccount') }}
          <RouterLink to="/signup" class="font-semibold text-emerald-400 hover:text-emerald-300">
            {{ $t('signup') }}
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
