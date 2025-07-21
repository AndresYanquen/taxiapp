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
    // Handle login errors from the API
    if (error.response && error.response.data && error.response.data.error) {
      errorMessage.value = error.response.data.error // e.g., "Invalid credentials."
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
  <div class="flex items-center justify-center min-h-screen bg-gray-50">
    <div class="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-xl">
      <!-- Header -->
      <div class="text-center">
        <a href="#" class="text-3xl font-bold text-gray-900">
          <i class="fa-solid fa-car-side text-blue-600"></i> SwiftRide
        </a>
        <h2 class="mt-4 text-2xl font-bold text-gray-900">Sign in to your account</h2>
        <p class="mt-2 text-sm text-gray-600">Welcome back! Please enter your details.</p>
      </div>

      <!-- Error Message Display -->
      <div v-if="errorMessage" class="p-3 text-sm text-center text-red-800 bg-red-100 rounded-lg">
        {{ errorMessage }}
      </div>

      <!-- Login Form -->
      <form class="mt-8 space-y-6" @submit.prevent="handleLogin">
        <div class="space-y-4 rounded-md shadow-sm">
          <div>
            <label for="email-address" class="sr-only">Email address</label>
            <input
              id="email-address"
              name="email"
              type="email"
              autocomplete="email"
              required
              v-model="email"
              class="relative block w-full px-3 py-3 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
              placeholder="Email address"
            />
          </div>
          <div>
            <label for="password" class="sr-only">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
              v-model="password"
              class="relative block w-full px-3 py-3 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
              placeholder="Password"
            />
          </div>
        </div>

        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <input
              id="remember-me"
              name="remember-me"
              type="checkbox"
              class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label for="remember-me" class="block ml-2 text-sm text-gray-900"> Remember me </label>
          </div>

          <div class="text-sm">
            <a href="#" class="font-medium text-blue-600 hover:text-blue-500">
              Forgot your password?
            </a>
          </div>
        </div>

        <div>
          <button
            type="submit"
            :disabled="isLoading"
            class="relative flex justify-center w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md group hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            <!-- Loading Spinner -->
            <svg
              v-if="isLoading"
              class="w-5 h-5 mr-3 -ml-1 text-white animate-spin"
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
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span class="absolute inset-y-0 left-0 flex items-center pl-3"> </span>
            {{ isLoading ? 'Signing in...' : 'Sign in' }}
          </button>
        </div>
      </form>

      <!-- Footer Link to Signup -->
      <p class="mt-6 text-sm text-center text-gray-600">
        Don't have an account?
        <RouterLink to="/signup" class="font-medium text-blue-600 hover:text-blue-500">
          Sign Up
        </RouterLink>
      </p>
    </div>
  </div>
</template>
