<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'
import type { Map as LeafletMap, LatLng, Marker, Polyline } from 'leaflet'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import type { AppState, Driver } from '../types' // Simplified Driver type
import { useAuthStore } from '@/stores/auth.store'
import { useRouter } from 'vue-router'

// --- API and Socket Configuration ---
let socket: Socket

// --- Refs and Reactive State ---
const mapContainer = ref<HTMLElement | null>(null)
const map = ref<LeafletMap | null>(null)
const riderMarker = ref<Marker | null>(null)
const drivers = ref<Driver[]>([])
const routePolyline = ref<Polyline | null>(null)

const rideId = ref<string | null>(null)
const appState = ref<AppState>('idle')
const statusMessage = ref('Finding your location...')
const assignedDriver = ref<Driver | null>(null)
const showLocationErrorModal = ref(false)
const router = useRouter()

// --- New State for Ride Request ---
const destinationAddress = ref('')
const selectedCarType = ref('')
const carTypes = ref(['Standard', 'Comfort', 'XL', 'Premium'])

// --- Leaflet Custom Icons ---
const createDivIcon = (content: string, className: string) =>
  L.divIcon({
    html: content,
    className: `custom-icon ${className}`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
const riderIcon = createDivIcon('🧍', 'custom-icon-rider')
const driverIcon = createDivIcon('🚗', 'custom-icon-driver')

const authStore = useAuthStore()

// --- Lifecycle Hooks ---
onMounted(() => {
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }
  locateUserAndInitMap()
  checkForActiveRide()
})

onUnmounted(() => {
  if (socket) socket.disconnect()
})

// --- WebSocket and UI State Functions ---

const setupSocketListeners = () => {
  if (!rideId.value) return
  if (socket?.connected) socket.disconnect()

  socket = io(import.meta.env.VITE_BACKEND_URL, {
    auth: { token: authStore.user.token },
  })

  socket.on('connect', () => {
    console.log(`Socket connected with ID: ${socket.id}`)
    socket.emit('joinRideRoom', rideId.value)
  })

  socket.on('trip-updated', (updatedTrip) => {
    console.log('Received trip-updated event:', updatedTrip)
    updateUIFromState(updatedTrip.status, updatedTrip.driverId)
  })

  socket.on('trip-accepted', (acceptedTrip) => {
    console.log('Trip was accepted:', acceptedTrip)
    updateUIFromState(acceptedTrip.status, acceptedTrip.driverId)
  })

  socket.on('disconnect', () => console.log('Socket disconnected.'))
}

const updateUIFromState = (newState: AppState, driver: Driver | null) => {
  if (!map.value || !riderMarker.value) return

  appState.value = newState
  assignedDriver.value = driver

  if (routePolyline.value) map.value.removeLayer(routePolyline.value)
  drivers.value.forEach((d) => map.value?.removeLayer(d.marker))
  drivers.value = []

  switch (newState) {
    case 'REQUESTED':
      statusMessage.value = 'Finding nearest driver...'
      break

    case 'ACCEPTED':
    case 'IN_PROGRESS':
      if (driver) {
        statusMessage.value = `${driver.name} is on the way!`
        // In a real app, driver.location would be updated via a separate socket event
        const driverPosition = L.latLng(6.248, -75.585) // Placeholder
        const driverMarker = L.marker(driverPosition, { icon: driverIcon }).addTo(map.value)
        drivers.value = [{ ...driver, marker: driverMarker }]
        map.value.fitBounds([driverMarker.getLatLng(), riderMarker.value.getLatLng()], {
          padding: [70, 70],
        })
        drawRoute(driverMarker.getLatLng(), riderMarker.value.getLatLng())
      }
      break

    case 'COMPLETED':
      statusMessage.value = 'Your trip is complete. Thank you!'
      localStorage.removeItem('rideId')
      setTimeout(() => updateUIFromState('idle', null), 3000)
      break

    case 'CANCELLED':
    case 'idle':
    default:
      statusMessage.value = ''
      appState.value = 'idle'
      assignedDriver.value = null
      destinationAddress.value = ''
      selectedCarType.value = ''
      localStorage.removeItem('rideId')
      map.value.setView(riderMarker.value.getLatLng(), 15)
      break
  }
}

// --- Core Map and API Functions ---

const locateUserAndInitMap = async () => {
  try {
    let coords: { latitude: number; longitude: number }
    const platform = Capacitor.getPlatform()

    if (platform !== 'web') {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
      coords = position.coords
    } else {
      const position = await new Promise<{ coords: GeolocationCoordinates }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      })
      coords = position.coords
    }
    const userPosition = L.latLng(coords.latitude, coords.longitude)
    statusMessage.value = ''
    initMap(userPosition)
  } catch (error) {
    console.error('Error getting location:', error)
    statusMessage.value = 'Could not access your location.'
    showLocationErrorModal.value = true
  }
}

const initMap = (initialPosition: LatLng) => {
  if (!mapContainer.value) return

  map.value = L.map(mapContainer.value, {
    zoomControl: false,
    attributionControl: false,
  }).setView(initialPosition, 15)

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  }).addTo(map.value)

  L.control.zoom({ position: 'topright' }).addTo(map.value)

  riderMarker.value = L.marker(initialPosition, { icon: riderIcon })
    .addTo(map.value)
    .bindPopup('Estàs Aquì')
    .openPopup()
}

const checkForActiveRide = async () => {
  if (!authStore.isAuthenticated) return

  try {
    const response = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/trips/rider/active`, {
      headers: { Authorization: `Bearer ${authStore.user.token}` },
    })
    const activeTrip = response.data
    if (activeTrip) {
      rideId.value = activeTrip._id
      updateUIFromState(activeTrip.status, activeTrip.driverId)
      setupSocketListeners()
    } else {
      updateUIFromState('idle', null)
    }
  } catch (error) {
    console.error('Error checking for active ride:', error)
    updateUIFromState('idle', null)
  }
}

const requestRide = async () => {
  if (!riderMarker.value || !destinationAddress.value || !selectedCarType.value) return
  updateUIFromState('REQUESTED', null)

  try {
    const res = await axios.post(
      `${import.meta.env.VITE_BACKEND_URL}/api/trips/request`,
      {
        pickupLocation: riderMarker.value.getLatLng(),
        // In a real app, a geocoding API would convert the address to coordinates.
        dropoffAddress: destinationAddress.value,
        dropoffLocation: {
          lat: riderMarker.value.getLatLng().lat + 0.02, // Simulated dropoff
          lng: riderMarker.value.getLatLng().lng + 0.02,
        },
        carType: selectedCarType.value,
      },
      { headers: { Authorization: `Bearer ${authStore.user.token}` } },
    )
    rideId.value = res.data._id
    localStorage.setItem('rideId', rideId.value!)
    setupSocketListeners()
  } catch (error) {
    console.error('Error requesting ride:', error)
    alert('Could not request a ride.')
    updateUIFromState('idle', null)
  }
}

const cancelRide = async () => {
  if (!rideId.value) return
  try {
    await axios.post(
      `${import.meta.env.VITE_BACKEND_URL}/api/trips/${rideId.value}/cancel`,
      {},
      { headers: { Authorization: `Bearer ${authStore.user.token}` } },
    )
    if (socket) socket.disconnect()
    updateUIFromState('CANCELLED', null)
  } catch (error) {
    console.error('Error canceling ride:', error)
    alert('Could not cancel the ride.')
  }
}

const drawRoute = (start: LatLng, end: LatLng) => {
  if (!map.value) return
  if (routePolyline.value) map.value.removeLayer(routePolyline.value)
  routePolyline.value = L.polyline([start, end], {
    color: '#000000',
    weight: 4,
    opacity: 0.7,
    dashArray: '10, 10',
  }).addTo(map.value)
}
</script>

<template>
  <div id="app-wrapper">
    <div id="map" ref="mapContainer"></div>

    <div class="ui-container absolute top-5 left-1/2 -translate-x-1/2 z-20 w-full max-w-sm px-4">
      <transition name="fade">
        <div
          v-if="statusMessage"
          class="bg-white rounded-lg shadow-xl p-3 text-center text-gray-700 font-semibold"
        >
          <p>{{ statusMessage }}</p>
        </div>
      </transition>
    </div>

    <div class="ui-container absolute bottom-10 left-0 w-full p-4 z-20">
      <transition name="fade" mode="out-in">
        <!-- RIDE REQUEST FORM (IDLE STATE) -->
        <div
          v-if="appState === 'idle'"
          key="idle"
          class="bg-white rounded-xl shadow-2xl p-5 max-w-md mx-auto space-y-4"
        >
          <div>
            <label for="destination" class="block text-sm font-medium text-gray-700"
              >Where to?</label
            >
            <input
              type="text"
              id="destination"
              v-model="destinationAddress"
              placeholder="Enter destination address"
              class="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label for="car-type" class="block text-sm font-medium text-gray-700"
              >Select ride type</label
            >
            <select
              id="car-type"
              v-model="selectedCarType"
              class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="" disabled>Choose a car type</option>
              <option v-for="car in carTypes" :key="car" :value="car">{{ car }}</option>
            </select>
          </div>
          <button
            @click="requestRide"
            :disabled="!destinationAddress || !selectedCarType || !!statusMessage"
            class="w-full bg-black text-white font-bold py-3 px-12 rounded-lg shadow-lg hover:bg-gray-800 transition-transform transform hover:scale-105 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            Request Ride
          </button>
        </div>

        <!-- TRIP IN PROGRESS PANEL -->
        <div
          v-else-if="(appState === 'ACCEPTED' || appState === 'IN_PROGRESS') && assignedDriver"
          key="in-progress"
          class="bg-white rounded-xl shadow-2xl p-5 max-w-md mx-auto"
        >
          <div class="flex items-center">
            <div
              class="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center text-white text-3xl mr-4 shrink-0"
            >
              🚗
            </div>
            <div>
              <h2 class="font-bold text-lg text-gray-900">
                {{ assignedDriver.name }} is on the way!
              </h2>
              <p v-if="assignedDriver.car" class="text-gray-600">
                {{ assignedDriver.car.model }} - {{ assignedDriver.car.color }}
              </p>
              <p
                v-if="assignedDriver.car"
                class="font-semibold text-gray-800 bg-gray-100 inline-block px-2 py-1 rounded-md mt-1"
              >
                {{ assignedDriver.car.plate }}
              </p>
            </div>
          </div>
          <button
            @click="cancelRide"
            class="w-full bg-red-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-red-600 transition mt-4"
          >
            Cancel Ride
          </button>
        </div>
      </transition>
    </div>

    <!-- LOCATION ERROR MODAL -->
    <transition name="fade">
      <div
        v-if="showLocationErrorModal"
        class="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[5000]"
      >
        <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center">
          <h3 class="text-xl font-bold text-gray-800 mb-2">Location Error</h3>
          <p class="text-gray-600 mb-6">
            We couldn't get your location. Please enable location services for this app in your
            device or browser settings.
          </p>
          <button
            @click="showLocationErrorModal = false"
            class="bg-black text-white font-bold py-3 px-8 rounded-lg w-full hover:bg-gray-800 transition"
          >
            OK
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style>
body,
html {
  margin: 0;
  padding: 0;
  font-family: 'Inter', sans-serif;
}
#app-wrapper {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
#map {
  height: 100%;
  width: 100%;
  z-index: 10;
}
.ui-container {
  z-index: 1000;
}
.custom-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  color: white;
  font-size: 16px;
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  border: 2px solid white;
}
.custom-icon-rider {
  background-color: #1e90ff;
  width: 30px !important;
  height: 30px !important;
}
.custom-icon-driver {
  background-color: #222;
  width: 36px !important;
  height: 36px !important;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
