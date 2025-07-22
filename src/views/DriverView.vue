<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import L from 'leaflet'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'
import type { Map as LeafletMap, LatLng, Marker } from 'leaflet'
import { useAuthStore } from '@/stores/auth.store'
import { useRouter } from 'vue-router'
import type { Trip, Driver } from '../types' // Assuming you have a Trip type
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

// --- API and Socket Configuration ---
let socket: Socket

// --- Refs and Reactive State ---
const mapContainer = ref<HTMLElement | null>(null)
const map = ref<LeafletMap | null>(null)
const driverMarker = ref<Marker | null>(null)
const riderMarker = ref<Marker | null>(null)

// --- State for Location & Errors (New) ---
const statusMessage = ref('')
const showLocationErrorModal = ref(false)

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

let locationInterval: number | null = null

// This is the watch effect from the previous answer, now updated
watch(isAvailable, (isNowAvailable) => {
  if (isNowAvailable) {
    // The driver just went online. Start sending location updates.
    locationInterval = window.setInterval(async () => {
      try {
        // Use the new reusable function here as well
        const { latitude, longitude } = await getCurrentPosition()
        console.log('location driver update', latitude, longitude)
        const newLatLng = L.latLng(latitude, longitude)

        driverMarker.value?.setLatLng(newLatLng)

        if (socket && socket.connected) {
          socket.emit('update-location', { lat: latitude, lng: longitude })
        }
      } catch (error) {
        console.error('Error sending location update:', error)
        // Optionally, you could stop the interval if location fails repeatedly
      }
    }, 10000) // Send update every 10 seconds
  } else {
    // The driver just went offline. Stop sending updates.
    if (locationInterval) {
      clearInterval(locationInterval)
      locationInterval = null
    }
  }
})

// --- Lifecycle Hooks ---
onMounted(async () => {
  // Authentication and Role Guard
  if (!authStore.isAuthenticated || authStore.userRole !== 'driver') {
    authStore.logout()
    router.push('/login')
    return
  }

  // **MODIFICATION**: Call the new location function instead of initMap directly
  await locateUserAndInitMap()
  setupSocketListeners()
  fetchDriverState()
})

onUnmounted(() => {
  if (socket) socket.disconnect()
  if (locationInterval) {
    clearInterval(locationInterval)
  }
})

const getCurrentPosition = async (): Promise<{ latitude: number; longitude: number }> => {
  const platform = Capacitor.getPlatform()

  if (platform !== 'web') {
    // Use Capacitor Geolocation plugin for native platforms (iOS, Android)
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
    return position.coords
  } else {
    // Use the standard Web Geolocation API for browsers
    const position = await new Promise<{ coords: GeolocationCoordinates }>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000, // Time in ms before the request times out
      })
    })
    return position.coords
  }
}
// --- Core Functions ---

// **NEW FUNCTION**: Integrated from your request
const locateUserAndInitMap = async () => {
  try {
    // Call our new, reusable function to get the coordinates
    const coords = await getCurrentPosition()

    // Once we have coordinates, initialize the map at that position
    const userPosition = L.latLng(coords.latitude, coords.longitude)
    statusMessage.value = ''
    initMap(userPosition)
  } catch (error) {
    console.error('Error getting initial location:', error)
    statusMessage.value = 'Could not access your location. Defaulting to Medellín.'
    showLocationErrorModal.value = true

    // Fallback to a default location if geolocation fails
    initMap(L.latLng(6.2442, -75.5812))
  }
}

// **MODIFICATION**: initMap now accepts the user's position as an argument
const initMap = (initialPosition: LatLng) => {
  if (!mapContainer.value) return

  map.value = L.map(mapContainer.value).setView(initialPosition, 19)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  }).addTo(map.value)

  // Add driver marker at the fetched initial position
  driverMarker.value = L.marker(initialPosition, { icon: driverIcon, draggable: true }).addTo(
    map.value,
  )
  driverMarker.value.bindPopup('Your Location')
}

// --- (The rest of your functions: setupSocketListeners, fetchDriverState, etc. remain unchanged) ---
const setupSocketListeners = () => {
  socket = io(import.meta.env.VITE_BACKEND_URL, {
    auth: { token: authStore.authToken },
  })

  socket.on('connect', () => {
    console.log('Driver connected to WebSocket server!')
  })

  socket.on('new-trip-request', (newTrip: Trip) => {
    console.log('New trip request received:', newTrip)
    if (isAvailable.value && !activeTrip.value) {
      tripRequests.value.push(newTrip)
    }
  })

  socket.on('trip-unavailable', ({ tripId }) => {
    tripRequests.value = tripRequests.value.filter((trip) => trip._id !== tripId)
  })
}

const fetchDriverState = async () => {
  try {
    const tripRes = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/drivers/active-trip`, {
      headers: { Authorization: `Bearer ${authStore.authToken}` },
    })

    if (tripRes.data.activeTrip) {
      activeTrip.value = tripRes.data.activeTrip
      isAvailable.value = false
      updateMapForActiveTrip()
    } else {
      isAvailable.value = false
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
      if (riderMarker.value) map.value?.removeLayer(riderMarker.value)
      map.value?.setView(driverMarker.value!.getLatLng(), 13)
    }
  } catch (error) {
    alert(`Could not ${action} the trip.`)
  }
}

const updateMapForActiveTrip = () => {
  if (!activeTrip.value || !map.value || !driverMarker.value) return

  // Create the Leaflet LatLng object from the GeoJSON coordinates array.
  // The format is [longitude, latitude], so we access them by index.
  const riderLatLng = L.latLng(
    activeTrip.value.pickupLocation.coordinates[1], // Latitude
    activeTrip.value.pickupLocation.coordinates[0], // Longitude
  )

  // The rest of the function logic remains the same.
  if (!riderMarker.value) {
    riderMarker.value = L.marker(riderLatLng, { icon: riderIcon }).addTo(map.value)
  } else {
    riderMarker.value.setLatLng(riderLatLng)
  }
  riderMarker.value.bindPopup('Pickup Location')

  // Adjust map view to show both driver and rider
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
