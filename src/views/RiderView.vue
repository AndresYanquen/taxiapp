<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import L from 'leaflet'
import type { Map as LeafletMap, LatLng, Marker, Polyline } from 'leaflet'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import type { AppState, Driver, DriverData } from '../types'

// --- Refs and Reactive State ---
const mapContainer = ref<HTMLElement | null>(null)
const map = ref<LeafletMap | null>(null)
const riderMarker = ref<Marker | null>(null)
const drivers = ref<Driver[]>([])
const routePolyline = ref<Polyline | null>(null)
let simulationInterval: number | null = null

const appState = ref<AppState>('idle')
const statusMessage = ref('Finding your location...')
const assignedDriver = ref<Driver | null>(null)

// 👇 1. New state to control the location error modal
const showLocationErrorModal = ref(false)

// --- Hardcoded Data ---
const driverData: DriverData[] = [
  {
    id: 1,
    name: 'Carlos',
    car: { model: 'Renault Logan', color: 'Red', plate: 'ABC 123' },
    position: { lat: 6.248, lng: -75.585 },
  },
  {
    id: 2,
    name: 'Sofia',
    car: { model: 'Chevrolet Onix', color: 'White', plate: 'DEF 456' },
    position: { lat: 6.24, lng: -75.575 },
  },
  {
    id: 3,
    name: 'Mateo',
    car: { model: 'Kia Picanto', color: 'Gray', plate: 'GHI 789' },
    position: { lat: 6.25, lng: -75.58 },
  },
  {
    id: 4,
    name: 'Valentina',
    car: { model: 'Mazda 2', color: 'Blue', plate: 'JKL 012' },
    position: { lat: 6.245, lng: -75.59 },
  },
]

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

// --- Lifecycle Hooks ---
onMounted(() => {
  locateUserAndInitMap()
})

onUnmounted(() => {
  stopDriverSimulation()
})

// --- Core Functions ---
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
    // 👇 2. Trigger the modal when an error is caught
    showLocationErrorModal.value = true
  }
}

const initMap = (initialPosition: LatLng) => {
  if (!mapContainer.value) return

  map.value = L.map(mapContainer.value, {
    zoomControl: false,
    attributionControl: false,
  }).setView(initialPosition, 19)

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  }).addTo(map.value)

  L.control.zoom({ position: 'topright' }).addTo(map.value)

  riderMarker.value = L.marker(initialPosition, { icon: riderIcon })
    .addTo(map.value)
    .bindPopup('Estàs Aquì')
    .openPopup()

  drivers.value = driverData.map((d) => {
    const marker = L.marker([d.position.lat, d.position.lng], { icon: driverIcon }).addTo(
      map.value!,
    )
    return { ...d, marker }
  })

  startDriverSimulation()
}

// (The rest of your <script> section remains the same)
const startDriverSimulation = () => {
  simulationInterval = window.setInterval(() => {
    if (!map.value || !riderMarker.value) return

    if (appState.value === 'idle') {
      drivers.value.forEach((driver) => moveMarkerRandomly(driver.marker))
    } else if (appState.value === 'in-progress' && assignedDriver.value) {
      moveMarkerTowards(assignedDriver.value.marker, riderMarker.value.getLatLng())
    }
  }, 3000)
}

const stopDriverSimulation = () => {
  if (simulationInterval) clearInterval(simulationInterval)
}

const moveMarkerRandomly = (marker: Marker) => {
  const lat = marker.getLatLng().lat + (Math.random() - 0.5) * 0.001
  const lng = marker.getLatLng().lng + (Math.random() - 0.5) * 0.001
  marker.setLatLng([lat, lng])
}

const moveMarkerTowards = (marker: Marker, targetLatLng: LatLng) => {
  if (!map.value) return

  const currentLatLng = marker.getLatLng()
  const latStep = (targetLatLng.lat - currentLatLng.lat) * 0.2
  const lngStep = (targetLatLng.lng - currentLatLng.lng) * 0.2
  const newLat = currentLatLng.lat + latStep
  const newLng = currentLatLng.lng + lngStep

  marker.setLatLng([newLat, newLng])
  drawRoute(marker.getLatLng(), targetLatLng)

  if (map.value.distance(marker.getLatLng(), targetLatLng) < 50) {
    statusMessage.value = 'Your driver has arrived!'
    appState.value = 'finished'
    if (routePolyline.value) map.value.removeLayer(routePolyline.value)
    stopDriverSimulation()
  }
}

const drawRoute = (start: LatLng, end: LatLng) => {
  if (!map.value) return
  if (routePolyline.value) {
    map.value.removeLayer(routePolyline.value)
  }
  routePolyline.value = L.polyline([start, end], {
    color: '#000000',
    weight: 4,
    opacity: 0.7,
    dashArray: '10, 10',
  }).addTo(map.value)
}

const requestRide = () => {
  if (!map.value || !riderMarker.value) return
  appState.value = 'requesting'
  statusMessage.value = 'Finding nearest driver...'

  setTimeout(() => {
    const riderLatLng = riderMarker.value!.getLatLng()
    let closestDriver: Driver | null = null
    let minDistance = Infinity

    drivers.value.forEach((driver) => {
      const distance = map.value!.distance(riderLatLng, driver.marker.getLatLng())
      if (distance < minDistance) {
        minDistance = distance
        closestDriver = driver
      }
    })

    if (!closestDriver) return
    assignedDriver.value = closestDriver

    drivers.value.forEach((d) => {
      if (d.id !== closestDriver!.id) map.value!.removeLayer(d.marker)
    })

    appState.value = 'in-progress'
    const driverLatLng = closestDriver.marker.getLatLng()
    const distance = map.value.distance(driverLatLng, riderLatLng)
    const eta = Math.round((distance / 1000) * 2.5) // Simple ETA calculation

    statusMessage.value = `${closestDriver.name} is ${eta} min away`

    map.value.fitBounds([driverLatLng, riderLatLng], { padding: [50, 50] })
    drawRoute(driverLatLng, riderLatLng)
  }, 2500)
}

const cancelRide = () => {
  if (!map.value || !riderMarker.value) return
  appState.value = 'idle'
  statusMessage.value = ''
  assignedDriver.value = null
  if (routePolyline.value) map.value.removeLayer(routePolyline.value)
  drivers.value.forEach((d) => map.value!.addLayer(d.marker))
  map.value.setView(riderMarker.value.getLatLng(), 15)
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

    <div class="ui-container absolute bottom-20 left-0 w-full p-4 z-20">
      <transition name="fade" mode="out-in">
        <div v-if="appState === 'idle'" key="idle" class="flex justify-center">
          <button
            @click="requestRide"
            :disabled="!!statusMessage"
            class="bg-black text-white font-bold py-4 px-12 rounded-lg shadow-2xl hover:bg-gray-800 transition-transform transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Request a Ride
          </button>
        </div>

        <div
          v-else-if="appState === 'in-progress' && assignedDriver"
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
              <p class="text-gray-600">
                {{ assignedDriver.car.model }} - {{ assignedDriver.car.color }}
              </p>
              <p
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
/* Global styles, including custom icon definitions */
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
  z-index: 1000; /* Ensure UI is on top of the map */
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
  background-color: #1e90ff; /* Dodger Blue */
  width: 30px !important;
  height: 30px !important;
}

.custom-icon-driver {
  background-color: #222; /* Dark Grey */
  width: 36px !important;
  height: 36px !important;
}

/* Vue Transition styles */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
