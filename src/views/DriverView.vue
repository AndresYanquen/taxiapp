<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'
import type { Map as LeafletMap, LatLng, Marker } from 'leaflet'
import { useAuthStore } from '@/stores/auth.store'
import { useRouter } from 'vue-router'
import type { Trip, Driver } from '../types' // Assuming you have a Trip type

// --- API and Socket Configuration ---
let socket: Socket

// --- Refs and Reactive State ---
const mapContainer = ref<HTMLElement | null>(null)
const map = ref<LeafletMap | null>(null)
const driverMarker = ref<Marker | null>(null)
const riderMarker = ref<Marker | null>(null)

const isAvailable = ref(false)
const isLoadingAvailability = ref(false)
const activeTrip = ref<Trip | null>(null)
const tripRequests = ref<Trip[]>([])

const authStore = useAuthStore()
const router = useRouter()

// --- Leaflet Custom Icons ---
const createDivIcon = (content: string, className: string) =>
  L.divIcon({ html: content, className, iconSize: [30, 30], iconAnchor: [15, 30] })
const driverIcon = createDivIcon('🚗', 'custom-icon custom-icon-driver')
const riderIcon = createDivIcon('🧍', 'custom-icon custom-icon-rider')

// --- Lifecycle Hooks ---
onMounted(() => {
  // Authentication and Role Guard
  if (!authStore.isAuthenticated || authStore.userRole !== 'driver') {
    authStore.logout() // Log out if not a valid driver
    router.push('/login')
    return
  }

  initMap()
  setupSocketListeners()
  fetchDriverState()
})

onUnmounted(() => {
  if (socket) socket.disconnect()
})

// --- Core Functions ---
const initMap = () => {
  // Initialize map centered on Medellin
  const initialPosition = L.latLng(6.2442, -75.5812)
  map.value = L.map(mapContainer.value).setView(initialPosition, 13)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO',
  }).addTo(map.value)

  // Add driver marker
  driverMarker.value = L.marker(initialPosition, { icon: driverIcon, draggable: true }).addTo(
    map.value,
  )
  driverMarker.value.bindPopup('Your Location')

  // In a real app, you would send the driver's location to the backend periodically
  // For now, we just simulate it.
}

const setupSocketListeners = () => {
  socket = io(import.meta.env.VITE_BACKEND_URL, {
    auth: { token: authStore.authToken },
  })

  socket.on('connect', () => {
    console.log('Driver connected to WebSocket server!')
  })

  // Listen for new ride requests from the server
  socket.on('new-trip-request', (newTrip: Trip) => {
    console.log('New trip request received:', newTrip)
    // Add request to the list if the driver is available and not on a trip
    if (isAvailable.value && !activeTrip.value) {
      tripRequests.value.push(newTrip)
    }
  })

  // Listen for when a trip is no longer available (e.g., another driver accepted it)
  socket.on('trip-unavailable', ({ tripId }) => {
    tripRequests.value = tripRequests.value.filter((trip) => trip._id !== tripId)
  })
}

// --- API Functions ---
const fetchDriverState = async () => {
  try {
    // Check for an active trip first
    const tripRes = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/drivers/active-trip`, {
      headers: { Authorization: `Bearer ${authStore.authToken}` },
    })

    if (tripRes.data.activeTrip) {
      activeTrip.value = tripRes.data.activeTrip
      isAvailable.value = false // A driver on a trip cannot be available
      updateMapForActiveTrip()
    } else {
      // If no active trip, check the driver's last known availability
      // (This would typically be part of a /api/driver/me endpoint)
      isAvailable.value = false // Default to offline
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
      tripRequests.value = [] // Clear requests when going offline
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
    isAvailable.value = false // Accepting a trip makes you unavailable
    tripRequests.value = [] // Clear all other requests
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
      isAvailable.value = true // Optionally go back online
      if (riderMarker.value) map.value?.removeLayer(riderMarker.value)
      map.value?.setView(driverMarker.value!.getLatLng(), 13)
    }
  } catch (error) {
    alert(`Could not ${action} the trip.`)
  }
}

const updateMapForActiveTrip = () => {
  if (!activeTrip.value || !map.value || !driverMarker.value) return

  const riderLatLng = L.latLng(
    activeTrip.value.pickupLocation.lat,
    activeTrip.value.pickupLocation.lng,
  )

  // Add or move rider marker
  if (!riderMarker.value) {
    riderMarker.value = L.marker(riderLatLng, { icon: riderIcon }).addTo(map.value)
  } else {
    riderMarker.value.setLatLng(riderLatLng)
  }
  riderMarker.value.bindPopup('Pickup Location')

  // Fit map to show both driver and rider
  map.value.fitBounds(L.latLngBounds([driverMarker.value.getLatLng(), riderLatLng]), {
    padding: [50, 50],
  })
}
</script>

<template>
  <div class="relative w-screen h-screen flex">
    <!-- Map -->
    <div ref="mapContainer" class="h-full flex-grow"></div>

    <!-- UI Panel -->
    <div
      class="absolute top-0 left-0 bottom-0 z-[1000] w-full max-w-sm bg-white shadow-lg p-4 flex flex-col overflow-y-auto"
    >
      <!-- Header -->
      <div class="pb-4 border-b">
        <h1 class="text-2xl font-bold">Driver Dashboard</h1>
        <p class="text-gray-500">Welcome, Driver!</p>
      </div>

      <!-- Availability Toggle -->
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

      <!-- Main Content Area -->
      <div class="flex-grow pt-4">
        <!-- Active Trip View -->
        <div v-if="activeTrip && activeTrip.status !== 'COMPLETED'">
          <h2 class="text-xl font-bold text-blue-600 mb-2">Active Trip</h2>
          <div class="p-3 bg-blue-50 rounded-lg">
            <p>
              <strong>Status:</strong> <span class="font-semibold">{{ activeTrip.status }}</span>
            </p>
            <p><strong>Pickup:</strong> A location would be shown here.</p>
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

        <!-- Incoming Requests View -->
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
              <p><strong>From:</strong> A location would be shown here.</p>
              <p><strong>To:</strong> Another location would be shown here.</p>
              <button
                @click="acceptTrip(trip._id)"
                class="mt-2 w-full bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600"
              >
                Accept Ride
              </button>
            </li>
          </ul>
        </div>

        <!-- Offline View -->
        <div v-else class="text-center text-gray-500 pt-8">
          <p>You are currently offline. Go online to receive ride requests.</p>
        </div>
      </div>

      <!-- Footer -->
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
