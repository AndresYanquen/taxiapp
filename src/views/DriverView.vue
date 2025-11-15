<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import L from 'leaflet'
import { App } from '@capacitor/app'
import { io, Socket } from 'socket.io-client'
import type { Map as LeafletMap, LatLng, Marker } from 'leaflet'
import { useAuthStore } from '@/stores/auth.store'
import { useRouter } from 'vue-router'
import type { Trip, Driver } from '../types'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { useApi } from '@/composables/useApi'
import { handleTokenExpiryIfNeeded } from '@/utils/tokenExpiration'

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
const api = useApi()
let locationInterval: number | null = null

let appStateRemove: (() => void) | null = null
let webBeforeUnloadHandler: (() => void) | null = null
let webVisibilityHandler: (() => void) | null = null

// --- Leaflet Custom Icons ---
const createDivIcon = (content: string, className: string) =>
  L.divIcon({ html: content, className, iconSize: [30, 30], iconAnchor: [15, 30] })
const driverIcon = createDivIcon('🚗', 'custom-icon custom-icon-driver')
const riderIcon = createDivIcon('🧍', 'custom-icon custom-icon-rider')

const goOfflineReliably = async () => {
  try {
    console.log('Running reliable offline task...')
    await api.patch(`${import.meta.env.VITE_BACKEND_URL}/api/drivers/availability`, {
      isAvailable: false,
    })
    console.log('✅ Driver set to offline.')
  } catch (error) {
    console.error('Reliable offline task failed:', error)

    // Fallback: sendBeacon when the page/tab is closing or hidden (web only)
    if ('sendBeacon' in navigator) {
      // NOTE: sendBeacon cannot set headers. Use same-origin cookies,
      // or expose a beacon-friendly endpoint that doesn't require auth headers.
      const url = `${import.meta.env.VITE_BACKEND_URL}/api/drivers/availability`
      const blob = new Blob([JSON.stringify({ isAvailable: false })], { type: 'application/json' })
      navigator.sendBeacon(url, blob)
      console.log('📡 Sent offline status via sendBeacon.')
    }
  }
}

const sendLocationUpdate = async () => {
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
}

// --- Lifecycle and Watchers ---
watch(isAvailable, (isNowAvailable) => {
  if (isNowAvailable) {
    sendLocationUpdate()

    // Then, set the interval for all subsequent updates
    locationInterval = window.setInterval(sendLocationUpdate, 20000)
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

  if (Capacitor.getPlatform() !== 'web') {
    const listener = App.addListener('appStateChange', async (state) => {
      if (!state.isActive) {
        //await goOfflineReliably()
      }
    })
  } else {
    // WEB: when tab is closing or hidden
    webBeforeUnloadHandler = () => {
      //void goOfflineReliably()
    }
    webVisibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        //void goOfflineReliably()
      }
    }

    window.addEventListener('beforeunload', webBeforeUnloadHandler)
    document.addEventListener('visibilitychange', webVisibilityHandler)
  }
})

onUnmounted(() => {
  if (socket) socket.disconnect()
  if (locationInterval) clearInterval(locationInterval)

  const url = `${import.meta.env.VITE_BACKEND_URL}/api/drivers/go-offline`
  const driverId = authStore.user?.id

  // Clean up listeners
  if (appStateRemove) {
    appStateRemove()
    appStateRemove = null
  }
  if (webBeforeUnloadHandler) {
    window.removeEventListener('beforeunload', webBeforeUnloadHandler)
    webBeforeUnloadHandler = null
  }
  if (webVisibilityHandler) {
    document.removeEventListener('visibilitychange', webVisibilityHandler)
    webVisibilityHandler = null
  }
})

const testOffline = () => {
  console.log('Testing go offline request...')
  const url = `${import.meta.env.VITE_BACKEND_URL}/api/drivers/availability`
  const body = JSON.stringify({ isAvailable: false })
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authStore.authToken}`,
  }

  fetch(url, {
    method: 'PATCH',
    body,
    headers,
  })
    .then((response) => {
      // Check if the request was successful (status code 200-299)
      if (!response.ok) {
        // If not, we throw an error to be caught by the .catch block
        throw new Error(`Network response was not ok, status: ${response.status}`)
      }
      // If the response is OK, we parse the JSON body. This returns a promise.
      return response.json()
    })
    .then((data) => {
      if (handleTokenExpiryIfNeeded(data)) {
        return
      }
      // This .then() receives the resolved promise from response.json()
      console.log('✅ Test successful. Server response data:', data)
    })
    .catch((err) => {
      console.error('❌ Test error:', err)
    })
}

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
        alert('El usuario canceló el viaje.')
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
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  }).addTo(map.value)
  driverMarker.value = L.marker(initialPosition, { icon: driverIcon }).addTo(map.value)
}

// In DriverView.vue

const fetchDriverState = async () => {
  try {
    // Call the new endpoint to get the full driver state
    const res = await api.get(`${import.meta.env.VITE_BACKEND_URL}/api/drivers/me`)

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
    await api.patch(`${import.meta.env.VITE_BACKEND_URL}/api/drivers/availability`, {
      isAvailable: newAvailability,
    })
    isAvailable.value = newAvailability
    if (!newAvailability) {
      tripRequests.value = []
    }
  } catch (error: any) {
    const backendError = error?.response?.data?.error || error?.response?.data?.message
    alert(backendError || 'Could not update availability.')
    console.log(backendError)
  } finally {
    isLoadingAvailability.value = false
  }
}

const acceptTrip = async (tripId: string) => {
  try {
    const res = await api.post(`${import.meta.env.VITE_BACKEND_URL}/api/trips/${tripId}/accept`)
    activeTrip.value = res.data
    isAvailable.value = false
    tripRequests.value = []

    // This part is correct: you tell the server to join the room
    if (socket && socket.connected) {
      socket.emit('joinRideRoom', tripId)
    }
    updateMapForActiveTrip()
  } catch (error: any) {
    const backendError = error?.response?.data?.error || error?.response?.data?.message
    alert(backendError || 'Could not accept trip. It may have been taken by another driver.')
    tripRequests.value = tripRequests.value.filter((trip) => trip._id !== tripId)
  }
}

const handleTripAction = async (action: 'start' | 'complete') => {
  if (!activeTrip.value) return
  try {
    const res = await api.post(
      `${import.meta.env.VITE_BACKEND_URL}/api/trips/${activeTrip.value._id}/${action}`,
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
  } catch (error: any) {
    const backendError = error?.response?.data?.error || error?.response?.data?.message
    alert(backendError || `Could not ${action} the trip.`)
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
  <div id="driver-app-wrapper">
    <div id="driver-map" ref="mapContainer"></div>

    <div class="driver-ui absolute top-6 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 px-6">
      <transition name="fade">
        <div
          v-if="statusMessage"
          class="flex items-center gap-3 rounded-3xl border border-white/15 bg-gray-900/80 px-5 py-4 text-white shadow-2xl backdrop-blur"
        >
          <span
            class="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300"
          >
            <i class="pi pi-sparkles text-xl"></i>
          </span>
          <div>
            <p class="text-[11px] uppercase tracking-[0.35em] text-emerald-200">Estado</p>
            <p class="text-sm font-semibold text-white">{{ statusMessage }}</p>
          </div>
        </div>
      </transition>
    </div>

    <div
      class="driver-card-wrapper pointer-events-none absolute bottom-6 left-0 z-30 w-full px-4 sm:px-6"
    >
      <div
        class="pointer-events-auto mx-auto w-full max-w-md rounded-[32px] border border-white/10 bg-[#0E141B]/90 p-5 text-white shadow-[0_35px_90px_-45px_rgba(0,0,0,0.9)] backdrop-blur-lg sm:max-w-lg sm:p-6"
      >
        <header class="flex items-center justify-between">
          <div>
            <p class="text-[11px] uppercase tracking-[0.4em] text-cyan-200">SwiftX</p>
            <h2 class="text-3xl font-semibold">
              {{ activeTrip ? 'En ruta' : isAvailable ? 'Disponible' : 'Offline' }}
            </h2>
            <p class="text-xs text-gray-400">
              {{
                activeTrip ? 'Sigue la ruta y completa el viaje.' : 'Administra tu disponibilidad.'
              }}
            </p>
          </div>
          <button
            @click="toggleAvailability"
            :disabled="isLoadingAvailability || !!activeTrip"
            :class="[
              'flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition',
              isAvailable
                ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                : 'border-white/10 bg-white/5 text-gray-200',
              (isLoadingAvailability || !!activeTrip) && 'opacity-50 cursor-not-allowed',
            ]"
          >
            <span
              class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] text-white"
            >
              <i :class="isAvailable ? 'pi pi-check' : 'pi pi-power-off'"></i>
            </span>
            {{ isAvailable ? 'Online' : 'Offline' }}
          </button>
        </header>

        <div class="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <template v-if="activeTrip && activeTrip.status !== 'COMPLETED'">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm text-gray-300">
                <i class="pi pi-map-marker text-emerald-300"></i>
                <span>{{ activeTrip.pickupName.split(',')[0] }}</span>
              </div>
              <span class="rounded-full bg-white/10 px-3 py-1 text-xs text-gray-200">{{
                activeTrip.status
              }}</span>
            </div>
            <div class="mt-4 space-y-3 text-sm text-gray-200">
              <p><span class="text-gray-400">Recogida:</span> {{ activeTrip.pickupName }}</p>
              <p><span class="text-gray-400">Destino:</span> {{ activeTrip.destinationName }}</p>
              <p v-if="activeTrip.userIndications">
                <span class="text-gray-400">Indicaciones:</span> {{ activeTrip.userIndications }}
              </p>
            </div>
            <div class="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                v-if="activeTrip.status === 'ACCEPTED'"
                @click="handleTripAction('start')"
                class="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-gray-900 transition hover:bg-emerald-400"
              >
                Iniciar viaje
              </button>
              <button
                v-if="activeTrip.status === 'IN_PROGRESS'"
                @click="handleTripAction('complete')"
                class="rounded-2xl border border-white/20 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:border-white/40"
              >
                Completar viaje
              </button>
            </div>
          </template>

          <template v-else-if="isAvailable">
            <div class="flex items-center justify-between">
              <div class="text-sm">
                <p class="text-[11px] uppercase tracking-[0.4em] text-cyan-200">Solicitudes</p>
                <h3 class="text-xl font-semibold text-white">Viajes cercanos</h3>
              </div>
              <span class="rounded-full bg-white/10 px-3 py-1 text-xs text-gray-200"
                >{{ tripRequests.length }} en cola</span
              >
            </div>
            <div v-if="tripRequests.length === 0" class="mt-4 text-sm text-gray-400">
              Esperando nuevas solicitudes cerca de ti...
            </div>
            <ul v-else class="mt-4 space-y-3">
              <li
                v-for="trip in tripRequests"
                :key="trip._id"
                class="space-y-2 rounded-2xl border border-white/10 bg-[#111826] p-4"
              >
                <div class="text-lg font-semibold text-white">
                  {{ trip.pickupName.split(',')[0] }}
                </div>
                <div class="flex items-center gap-2 text-sm text-gray-300">
                  <i class="pi pi-arrow-right text-xs"></i>
                  <span>{{ trip.destinationName }}</span>
                </div>
                <p v-if="trip.userIndications" class="text-xs text-gray-400">
                  {{ trip.userIndications }}
                </p>
                <button
                  @click="acceptTrip(trip._id)"
                  class="mt-3 w-full rounded-2xl bg-[#3479FF] px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-[#5c91ff]"
                >
                  Aceptar
                </button>
              </li>
            </ul>
          </template>

          <template v-else>
            <div class="text-center text-sm text-gray-300">
              Estás desconectado. Activa tu disponibilidad para recibir viajes.
            </div>
          </template>
        </div>

        <footer class="mt-4 flex items-center justify-between text-xs text-gray-400">
          <div>
            <p class="uppercase tracking-wide text-[10px]">Cuenta</p>
            <p class="text-sm text-white font-semibold">{{ authStore.user?.name || 'Driver' }}</p>
          </div>
          <div class="flex gap-2">
            <button
              class="rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-wide text-gray-200 hover:border-emerald-400"
              @click="testOffline"
            >
              Test
            </button>
            <button
              class="rounded-full border border-red-400/50 px-3 py-1 text-[11px] uppercase tracking-wide text-red-300 hover:border-red-300 hover:text-red-200"
              @click="authStore.logout()"
            >
              Log Out
            </button>
          </div>
        </footer>
      </div>
    </div>
  </div>
</template>

<style>
#driver-app-wrapper {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
#driver-map {
  width: 100%;
  height: 100%;
}
.driver-ui {
  z-index: 1100;
}
.driver-card-wrapper {
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
