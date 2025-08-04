import { defineStore } from 'pinia'
import axios from 'axios'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

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

  // --- GETTERS ---
  const isAuthenticated = computed(() => !!user.value?.token)
  const authToken = computed(() => user.value?.token)
  const userRole = computed(() => user.value?.role)
  const currentUser = computed(() => user.value)

  // --- ACTIONS ---

  /**
   * Handles the user login process.
   * @param {string} email - The user's email.
   * @param {string} password - The user's password.
   */
  async function login(email, password) {
    try {
      const response = await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/auth/login`, {
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

      // Redirect user to the appropriate dashboard based on their role
      if (role === 'driver') {
        router.push('/driver')
      } else {
        router.push('/request-ride') // Default to rider dashboard
      }
    } catch (error) {
      console.error('Login failed:', error)
      // You can throw the error to be caught in the component for UI updates
      throw error
    }
  }

  function saveTokenOnSignUp({ token, role }) {
    user.value = { token, role }
    localStorage.setItem('user', JSON.stringify(user.value))
  }

  /**
   * Logs the user out.
   */
  function logout() {
    // Clear the state
    user.value = { token: null, role: null }
    // Remove from localStorage
    localStorage.removeItem('user')
    // Redirect to the login page
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
