<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth.store'
import { useRouter } from 'vue-router'
import type { Trip } from '../types' // Make sure your Trip type is correctly defined

const trips = ref<Trip[]>([])
const isLoading = ref(true)
const errorMessage = ref('')
const authStore = useAuthStore()
const router = useRouter()

// Function to format the date
const formatDate = (dateString?: string) => {
  if (!dateString) return 'Fecha no disponible'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }

  // Determine which endpoint to call based on the user's role
  const historyUrl =
    authStore.userRole === 'driver'
      ? `${import.meta.env.VITE_BACKEND_URL}/api/trips/history/driver`
      : `${import.meta.env.VITE_BACKEND_URL}/api/trips/history/passenger`

  try {
    const response = await axios.get(historyUrl, {
      headers: { Authorization: `Bearer ${authStore.authToken}` },
    })
    trips.value = response.data
  } catch (error) {
    errorMessage.value = 'Could not load trip history. Please try again later.'
    console.error('Error fetching trip history:', error)
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="bg-gray-100 min-h-screen">
    <header class="bg-white shadow-sm sticky top-0 z-10">
      <div class="max-w-4xl mx-auto p-4 flex items-center">
        <button @click="router.go(-1)" class="mr-4 p-2 rounded-full hover:bg-gray-200">
          &larr;
        </button>
        <h1 class="text-xl font-bold text-gray-900">Trip History</h1>
      </div>
    </header>

    <main class="p-4">
      <div v-if="isLoading" class="text-center py-10">
        <p>Loading history...</p>
      </div>
      <div v-else-if="errorMessage" class="text-center py-10 text-red-500">
        <p>{{ errorMessage }}</p>
      </div>
      <div v-else-if="trips.length === 0" class="text-center py-10 text-gray-500">
        <p>You have no past trips.</p>
      </div>

      <ul v-else class="space-y-4 max-w-4xl mx-auto">
        <li v-for="trip in trips" :key="trip._id" class="bg-white rounded-lg shadow p-4">
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold text-gray-800">{{
              trip.destinationName || 'Destination not set'
            }}</span>
            <span
              :class="{
                'bg-green-100 text-green-800': trip.status === 'COMPLETED',
                'bg-red-100 text-red-800': trip.status === 'CANCELLED',
                'bg-yellow-100 text-yellow-800':
                  trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED',
              }"
              class="px-2 py-1 text-xs font-semibold rounded-full"
            >
              {{ trip.status }}
            </span>
          </div>
          <p class="text-sm text-gray-600">From: {{ trip.pickupName }}</p>
          <div class="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
            <span>{{ formatDate(trip.createdAt) }}</span>
          </div>
        </li>
      </ul>
    </main>
  </div>
</template>
