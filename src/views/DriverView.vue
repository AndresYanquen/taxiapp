<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import L from 'leaflet'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'
import type { Map as LeafletMap, LatLng, Marker } from 'leaflet'
import { useAuthStore } from '@/stores/auth.store'
import { useRouter } from 'vue-router'
import type { Trip, Driver } from '../types'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

// --- API and Socket Configuration ---
let socket: Socket

// --- Refs and Reactive State ---
const mapContainer = ref<HTMLElement | null>(null)
const map = ref<LeafletMap | null>(null)
const driverMarker = ref<Marker | null>(null)
const riderMarker = ref<Marker | null>(null)
const statusMessage = ref('')
const showLocationErrorModal = ref(false)
const isAvailable = ref(false)
const isLoadingAvailability = ref(false)
const activeTrip = ref<Trip | null>(null)
const tripRequests = ref<Trip[]>([])
const authStore = useAuthStore()
const router = useRouter()
let locationInterval: number | null = null

// --- Leaflet Custom Icons ---
const createDivIcon = (content: string, className: string) =>
  L.divIcon({ html: content, className, iconSize: [30, 30], iconAnchor: [15, 30] })
const driverIcon = createDivIcon('🚗', 'custom-icon custom-icon-driver')
const riderIcon = createDivIcon('🧍', 'custom-icon custom-icon-rider')

// --- Lifecycle and Watchers ---
watch(isAvailable, (isNowAvailable) => {
  if (isNowAvailable) {
    locationInterval = window.setInterval(async () => {
      try {
        const { latitude, longitude } = await getCurrentPosition()
        const newLatLng = L.latLng(latitude, longitude)
        driverMarker.value?.setLatLng(newLatLng)
        if (socket && socket.connected) {
          socket.emit('update-location', { lat: latitude, lng: longitude })
        }
      } catch (error) {
        console.error('Error sending location update:', error)
      }
    }, 10000)
  } else {
    if (locationInterval) {
      clearInterval(locationInterval)
      locationInterval = null
    }
  }
})

onMounted(async () => {
  console.log('authStore', authStore)
  if (!authStore.isAuthenticated || authStore.userRole !== 'driver') {
    authStore.logout()
    router.push('/login')
    return
  }
  await locateUserAndInitMap()
  setupSocketListeners()
  fetchDriverState()
})

onUnmounted(() => {
  if (socket) socket.disconnect()
  if (locationInterval) clearInterval(locationInterval)
})

// --- Socket Listeners ---
const setupSocketListeners = () => {
  const token = authStore.authToken
  if (!token) {
    console.error('Authentication token not found, cannot connect socket.')
    return
  }

  // ✅ 1. Corrected authentication object
  socket = io(import.meta.env.VITE_BACKEND_URL, {
    auth: { token: token },
  })

  socket.on('connect', () => {
    console.log('Driver connected to WebSocket server!')
  })

  socket.on('new-trip-request', (newTrip: Trip) => {
    console.log('newTrip', newTrip)
    if (isAvailable.value && !activeTrip.value) {
      tripRequests.value.push(newTrip)
    }
  })

  socket.on('trip-unavailable', ({ tripId }) => {
    console.log('tripUnavailable', tripId)
    tripRequests.value = tripRequests.value.filter((trip) => trip._id !== tripId)
  })

  socket.on('trip-updated', (updatedTrip: Trip) => {
    console.log('trip-updated', updatedTrip)
    // Check if the update is for the currently active trip
    if (activeTrip.value && activeTrip.value._id === updatedTrip._id) {
      activeTrip.value = updatedTrip // Update the entire trip object

      if (updatedTrip.status === 'CANCELLED') {
        isAvailable.value = true
        alert('The rider has cancelled the trip.')
        activeTrip.value = null // Clear the active trip
        if (riderMarker.value && map.value) {
          map.value.removeLayer(riderMarker.value)
          riderMarker.value = null
        }
      }

      if (updatedTrip.status === 'COMPLETED') {
        // Handle completion if needed, though your handleTripAction may cover this
        activeTrip.value = null
      }
    }
  })
}

// --- Core Functions ---
const getCurrentPosition = async (): Promise<{ latitude: number; longitude: number }> => {
  const platform = Capacitor.getPlatform()
  if (platform !== 'web') {
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
    return position.coords
  } else {
    const position = await new Promise<{ coords: GeolocationCoordinates }>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      })
    })
    return position.coords
  }
}

const locateUserAndInitMap = async () => {
  try {
    const coords = await getCurrentPosition()
    const userPosition = L.latLng(coords.latitude, coords.longitude)
    initMap(userPosition)
  } catch (error) {
    console.error('Error getting initial location:', error)
    showLocationErrorModal.value = true
    initMap(L.latLng(6.2442, -75.5812)) // Fallback to Medellín
  }
}

const initMap = (initialPosition: LatLng) => {
  if (!mapContainer.value) return
  map.value = L.map(mapContainer.value).setView(initialPosition, 19)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  }).addTo(map.value)
  driverMarker.value = L.marker(initialPosition, { icon: driverIcon }).addTo(map.value)
}

// In DriverView.vue

const fetchDriverState = async () => {
  try {
    // Call the new endpoint to get the full driver state
    const res = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/drivers/me`, {
      headers: { Authorization: `Bearer ${authStore.authToken}` },
    })

    const { driver, activeTrip: trip } = res.data

    // Correctly set the availability from the database
    isAvailable.value = driver.isAvailable

    // Set the active trip if one exists
    if (trip) {
      activeTrip.value = trip
      // An active trip always means the driver is not available
      isAvailable.value = false
      updateMapForActiveTrip()
      // Join the trip's socket room if reconnecting
      if (socket && socket.connected) {
        socket.emit('joinRideRoom', trip._id)
      }
    }
  } catch (error) {
    console.error('Error fetching driver state:', error)
  }
}

const toggleAvailability = async () => {
  isLoadingAvailability.value = true
  try {
    const newAvailability = !isAvailable.value
    await axios.patch(
      `${import.meta.env.VITE_BACKEND_URL}/api/drivers/availability`,
      { isAvailable: newAvailability },
      { headers: { Authorization: `Bearer ${authStore.authToken}` } },
    )
    isAvailable.value = newAvailability
    if (!newAvailability) {
      tripRequests.value = []
    }
  } catch (error: any) {
    alert(error.response?.data?.error || 'Could not update availability.')
  } finally {
    isLoadingAvailability.value = false
  }
}

const acceptTrip = async (tripId: string) => {
  try {
    const res = await axios.post(
      `${import.meta.env.VITE_BACKEND_URL}/api/trips/${tripId}/accept`,
      {},
      { headers: { Authorization: `Bearer ${authStore.authToken}` } },
    )
    activeTrip.value = res.data
    isAvailable.value = false
    tripRequests.value = []

    // This part is correct: you tell the server to join the room
    if (socket && socket.connected) {
      socket.emit('joinRideRoom', tripId)
    }
    updateMapForActiveTrip()
  } catch (error) {
    alert('Could not accept trip. It may have been taken by another driver.')
    tripRequests.value = tripRequests.value.filter((trip) => trip._id !== tripId)
  }
}

const handleTripAction = async (action: 'start' | 'complete') => {
  if (!activeTrip.value) return
  try {
    const res = await axios.post(
      `${import.meta.env.VITE_BACKEND_URL}/api/trips/${activeTrip.value._id}/${action}`,
      {},
      { headers: { Authorization: `Bearer ${authStore.authToken}` } },
    )
    activeTrip.value = res.data

    if (action === 'complete') {
      activeTrip.value = null
      isAvailable.value = true
      if (riderMarker.value && map.value) {
        map.value.removeLayer(riderMarker.value)
        riderMarker.value = null
      }
      map.value?.setView(driverMarker.value!.getLatLng(), 13)
    }
  } catch (error) {
    alert(`Could not ${action} the trip.`)
  }
}

const updateMapForActiveTrip = () => {
  if (!activeTrip.value || !map.value || !driverMarker.value) return

  const riderLatLng = L.latLng(
    activeTrip.value.pickupLocation.coordinates[1], // Latitude
    activeTrip.value.pickupLocation.coordinates[0], // Longitude
  )

  if (!riderMarker.value) {
    riderMarker.value = L.marker(riderLatLng, { icon: riderIcon }).addTo(map.value)
  } else {
    riderMarker.value.setLatLng(riderLatLng)
  }

  map.value.fitBounds(L.latLngBounds([driverMarker.value.getLatLng(), riderLatLng]), {
    padding: [50, 50],
  })
}
</script>

<template>
  <div class="relative w-screen h-screen flex">
    <div ref="mapContainer" class="h-full flex-grow"></div>

    <div
      class="absolute top-0 left-0 bottom-0 z-[1000] w-full max-w-sm bg-white shadow-lg p-4 flex flex-col overflow-y-auto"
    >
      <div class="pb-4 border-b">
        <h1 class="text-2xl font-bold">Driver Dashboard</h1>
        <p class="text-gray-500">Welcome, Driver!</p>
      </div>

      <div class="py-4 border-b flex items-center justify-between">
        <span class="font-semibold text-lg">Go Online</span>
        <button
          @click="toggleAvailability"
          :disabled="isLoadingAvailability || !!activeTrip"
          :class="[
            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            isAvailable ? 'bg-green-600' : 'bg-gray-300',
          ]"
        >
          <span
            :class="[
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
              isAvailable ? 'translate-x-5' : 'translate-x-0',
            ]"
          ></span>
        </button>
      </div>

      <div class="flex-grow pt-4">
        <div v-if="activeTrip && activeTrip.status !== 'COMPLETED'">
          <h2 class="text-xl font-bold text-blue-600 mb-2">Active Trip</h2>
          <div class="p-3 bg-blue-50 rounded-lg space-y-1">
            <p>
              <strong>Status:</strong>
              <span class="font-semibold">{{ activeTrip.status }}</span>
            </p>
            <p><strong>Pickup:</strong> {{ activeTrip.pickupName }}</p>
            <p><strong>Destination:</strong> {{ activeTrip.destinationName }}</p>
            <div v-if="activeTrip.userIndications" class="pt-1">
              <p><strong>Indications:</strong> {{ activeTrip.userIndications }}</p>
            </div>
            <div class="mt-4 flex flex-col space-y-2">
              <button
                v-if="activeTrip.status === 'ACCEPTED'"
                @click="handleTripAction('start')"
                class="w-full bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600"
              >
                Start Trip
              </button>
              <button
                v-if="activeTrip.status === 'IN_PROGRESS'"
                @click="handleTripAction('complete')"
                class="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600"
              >
                Complete Trip
              </button>
            </div>
          </div>
        </div>

        <div v-else-if="isAvailable">
          <h2 class="text-xl font-bold text-gray-800 mb-2">Incoming Requests</h2>
          <div v-if="tripRequests.length === 0" class="text-center text-gray-500 pt-8">
            <p>Waiting for new ride requests...</p>
          </div>
          <ul v-else class="space-y-3">
            <li
              v-for="trip in tripRequests"
              :key="trip._id"
              class="p-3 bg-gray-100 rounded-lg shadow-sm"
            >
              <div class="space-y-1 text-sm">
                <p><strong>From:</strong> {{ trip.pickupName }}</p>
                <p><strong>To:</strong> {{ trip.destinationName }}</p>
                <p v-if="trip.userIndications" class="pt-1">
                  <strong>Indications:</strong> {{ trip.userIndications }}
                </p>
              </div>
              <button
                @click="acceptTrip(trip._id)"
                class="mt-2 w-full bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600"
              >
                Accept Ride
              </button>
            </li>
          </ul>
        </div>

        <div v-else class="text-center text-gray-500 pt-8">
          <p>You are currently offline. Go online to receive ride requests.</p>
        </div>
      </div>

      <div class="pt-4 mt-auto border-t">
        <button
          @click="authStore.logout()"
          class="w-full text-red-500 font-semibold hover:text-red-700"
        >
          Log Out
        </button>
      </div>
    </div>
  </div>
</template>

<style>
.custom-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  color: white;
  font-size: 16px;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  border: 2px solid white;
}
.custom-icon-driver {
  background-color: #222;
  width: 36px !important;
  height: 36px !important;
}
.custom-icon-rider {
  background-color: #1e90ff;
  width: 30px !important;
  height: 30px !important;
}
</style>
