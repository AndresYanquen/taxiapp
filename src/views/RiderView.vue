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
import { Dialog } from '@capacitor/dialog'

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
const showModal = ref(false)
const modalTitle = ref('')
const modalMessage = ref('')
const router = useRouter()

// --- New State for Ride Request ---
const pickupAddress = ref('Getting current location...')
const destinationAddress = ref('')
const isRequesting = ref(false)
const userIndications = ref('') // <-- ADDED: For additional user instructions
const selectedCarType = ref('')

let pollingInterval = null
let pollingAttempts = 0
const MAX_POLLING_ATTEMPTS = 3 // Intentará 3 veces
const POLLING_INTERVAL_MS = 10000

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
  if (pollingInterval) {
    clearInterval(pollingInterval)
  }
  if (socket) socket.disconnect()
})

const displayModal = (title: string, message: string) => {
  modalTitle.value = title
  modalMessage.value = message
  showModal.value = true
}

// --- WebSocket and UI State Functions ---

const findDriverWithPolling = async (pickupLatLng) => {
  console.log('findDriverWithPolling')
  pollingAttempts++
  statusMessage.value = `Buscando conductores... (Intento ${pollingAttempts}/${MAX_POLLING_ATTEMPTS})`

  try {
    // Usamos la ruta existente que busca conductores cercanos
    const response = await axios.get(
      `${import.meta.env.VITE_BACKEND_URL}/api/drivers/nearby?lat=${pickupLatLng.lat}&lng=${pickupLatLng.lng}`,
      { headers: { Authorization: `Bearer ${authStore.user.token}` } },
    )

    // Si encontramos conductores, procedemos a crear el viaje
    if (response.data && response.data.length > 0) {
      console.log('Conductores encontrados. Creando el viaje...')
      if (pollingInterval) clearInterval(pollingInterval)
      // Llama a la función que realmente crea el viaje en la base de datos
      await createTripRequest(pickupLatLng)
      return
    }

    // Si no hay conductores y no hemos superado los intentos, volvemos a intentar
    if (pollingAttempts >= MAX_POLLING_ATTEMPTS) {
      if (pollingInterval) clearInterval(pollingInterval)

      // Reemplaza el alert() con esto:
      isRequesting.value = false
      await Dialog.alert({
        title: 'Sin Conductores Disponibles',
        message:
          'Lo sentimos, no hay conductores disponibles en este momento. Por favor, inténtalo de nuevo más tarde.',
        buttonTitle: 'Entendido',
      })

      updateUIFromState('idle', null)
    }
  } catch (error) {
    console.error('Error buscando conductores:', error)
    if (pollingInterval) clearInterval(pollingInterval)
    alert('Ocurrió un error al buscar conductores.')
    updateUIFromState('idle', null)
  }
}

const setupSocketListeners = () => {
  const currentUser = authStore.currentUser

  console.log('Attempting to connect socket with token:', currentUser)

  if (!rideId.value) return
  if (socket?.connected) socket.disconnect()

  socket = io(import.meta.env.VITE_BACKEND_URL, {
    auth: currentUser,
  })

  socket.on('connect', () => {
    console.log(`Socket connected with ID: ${socket.id}`)
    socket.emit('joinRideRoom', rideId.value)
  })

  socket.on('trip-updated', (updatedTrip) => {
    console.log('Received trip-updated event:', updatedTrip)
    updateUIFromState(updatedTrip.status, updatedTrip.driverId)
  })

  socket.on('trip-accepted', ({ trip: acceptedTrip, driver }) => {
    console.log('Trip was accepted:', acceptedTrip)
    updateUIFromState(acceptedTrip.status, driver)
  })

  socket.on('disconnect', () => console.log('Socket disconnected.'))
}

const updateUIFromState = (newState: AppState, driver: Driver | null) => {
  if (!map.value) return

  appState.value = newState
  assignedDriver.value = driver // Assign the full driver object

  if (routePolyline.value) map.value.removeLayer(routePolyline.value)
  drivers.value.forEach((d) => map.value?.removeLayer(d.marker))
  drivers.value = []

  switch (newState) {
    case 'REQUESTED':
      statusMessage.value = 'Buscando conductores cercanos'
      break

    case 'ACCEPTED':
    case 'IN_PROGRESS':
      // Check for the full driver object and its location
      if (driver && driver.location && riderMarker.value) {
        statusMessage.value = `${driver.name} is on the way!`

        // Create LatLng from the GeoJSON coordinates
        const driverPosition = L.latLng(
          driver.location.coordinates[1], // Latitude
          driver.location.coordinates[0], // Longitude
        )

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
      {
        let modalTitle = 'Viaje Cancelado'
        let modalMessage = 'El viaje ha sido cancelado.' // Mensaje por defecto

        // El segundo argumento 'driver' contiene los datos del viaje actualizado
        const tripData = driver
        console.log('tripData', tripData)
        if (tripData) {
          // Escenario 1: El pasajero canceló el viaje
          if (tripData.cancelledBy === 'user') {
            modalMessage = 'Has cancelado tu viaje exitosamente.'
            // Si se aplicó una tarifa, se lo informamos
            if (tripData.cancellationFee && tripData.cancellationFee > 0) {
              const formattedFee = new Intl.NumberFormat('es-CO', {
                style: 'currency',
                currency: 'COP',
                minimumFractionDigits: 0,
              }).format(tripData.cancellationFee)
              modalMessage += ` Se aplicó un cargo de ${formattedFee}.`
            }
          }
          // Escenario 2: El conductor canceló el viaje
          else if (tripData.cancelledBy === 'driver') {
            modalTitle = 'El Conductor Canceló'
            modalMessage =
              'Tu conductor ha cancelado. Puedes solicitar un nuevo viaje si lo deseas.'
          }
        } // Escenario 3: El sistema canceló por timeout
        else {
          modalTitle = 'Búsqueda Terminada'
          modalMessage =
            'Lo sentimos, no encontramos un conductor disponible a tiempo. Por favor, inténtalo de nuevo.'
        }

        // Mostramos el modal con el mensaje correspondiente
        isRequesting.value = false
        displayModal(modalTitle, modalMessage)

        // --- Reinicio completo de la interfaz ---
        statusMessage.value = ''
        appState.value = 'idle'
        assignedDriver.value = null
        rideId.value = null // Limpia también la variable reactiva
        localStorage.removeItem('rideId')

        // Restablece la vista del mapa a la posición del pasajero
        if (map.value && riderMarker.value) {
          if (routePolyline.value) {
            map.value.removeLayer(routePolyline.value)
            routePolyline.value = null
          }
          map.value.setView(riderMarker.value.getLatLng(), 19)
        }
      }
      break
    case 'idle':
    default:
      statusMessage.value = ''
      appState.value = 'idle'
      assignedDriver.value = null
      destinationAddress.value = ''
      userIndications.value = ''
      selectedCarType.value = ''
      localStorage.removeItem('rideId')
      if (map.value && riderMarker.value) {
        map.value.setView(riderMarker.value.getLatLng(), 19)
      }
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
    console.log(coords.latitude, coords.longitude)
    const userPosition = L.latLng(coords.latitude, coords.longitude)
    statusMessage.value = ''
    initMap(userPosition)
  } catch (error) {
    console.error('Error getting location:', error)
    statusMessage.value = 'Could not access your location.'
    displayModal(
      'Error de Ubicación',
      'No pudimos obtener tu ubicación. Por favor, activa los servicios de localización en tu dispositivo o navegador.',
    )
  }
}

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

const initMap = (initialPosition: LatLng) => {
  if (!mapContainer.value) return

  map.value = L.map(mapContainer.value, {
    zoomControl: false,
    attributionControl: false,
  }).setView(initialPosition, 20)

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  }).addTo(map.value)

  L.control.zoom({ position: 'topright' }).addTo(map.value)

  riderMarker.value = L.marker(initialPosition, { icon: riderIcon, draggable: true })
    .addTo(map.value)
    .bindPopup('Your pickup location')
    .openPopup()

  // Update address when marker is dragged
  riderMarker.value.on('dragend', (event) => {
    const marker = event.target
    const position = marker.getLatLng()
    reverseGeocode(position)
  })

  // Initial address lookup
  console.log('riderMarker.value.getLatLng()', riderMarker.value.getLatLng())
  reverseGeocode(initialPosition)
}

const reverseGeocode = async (latlng: LatLng) => {
  pickupAddress.value = 'Buscando dirección...'

  try {
    const response = await axios.get(
      `${import.meta.env.VITE_BACKEND_URL}/api/location/reverse-geocode?lat=${latlng.lat}&lng=${latlng.lng}`,
      {
        headers: { Authorization: `Bearer ${authStore.user.token}` },
      },
    )

    console.log('response reverse location', response)
    if (response.data && response.data['address']) {
      console.log('response reverse location', response.data['address'])
      pickupAddress.value = response.data['address'] // Example address
    } else {
      pickupAddress.value = 'Dirección no encontrada.'
    }
  } catch (error) {}
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
      // The backend will now send the full driver object in the 'driverId' field.
      // We pass this directly to our updated UI function.
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
  if (!riderMarker.value || !destinationAddress.value || isRequesting.value) return
  isRequesting.value = true // <-- Deshabilita el botón aquí
  // Reiniciamos los contadores y el estado de la UI
  pollingAttempts = 0
  if (pollingInterval) clearInterval(pollingInterval)
  updateUIFromState('REQUESTED', null)

  const pickupLatLng = riderMarker.value.getLatLng()

  // Inicia la primera búsqueda inmediatamente
  findDriverWithPolling(pickupLatLng)

  // Configura las búsquedas posteriores a intervalos
  pollingInterval = setInterval(() => {
    if (pollingAttempts < MAX_POLLING_ATTEMPTS) {
      findDriverWithPolling(pickupLatLng)
    } else {
      clearInterval(pollingInterval)
    }
  }, POLLING_INTERVAL_MS)
}

const createTripRequest = async (pickupLatLng) => {
  try {
    statusMessage.value = 'Esperando respuesta del conductor...'

    // Transformamos las ubicaciones al formato GeoJSON que el backend espera
    const pickupGeoJSON = {
      type: 'Point',
      coordinates: [pickupLatLng.lng, pickupLatLng.lat],
    }

    const dropoffGeoJSON = {
      type: 'Point',
      coordinates: [0, 0], // Placeholder
    }

    const res = await axios.post(
      `${import.meta.env.VITE_BACKEND_URL}/api/trips/request`,
      {
        pickupLocation: pickupGeoJSON,
        dropoffLocation: dropoffGeoJSON,
        pickupName: pickupAddress.value,
        destinationName: destinationAddress.value,
        userIndications: userIndications.value,
      },
      { headers: { Authorization: `Bearer ${authStore.user.token}` } },
    )

    rideId.value = res.data._id
    localStorage.setItem('rideId', rideId.value)
    setupSocketListeners()
  } catch (error) {
    console.error('Error creando la solicitud de viaje:', error)
    alert('No se pudo crear la solicitud de viaje.')
    updateUIFromState('idle', null)
  }
}

const cancelRide = async () => {
  // 1. Nos aseguramos de que hay un viaje activo para cancelar
  if (!rideId.value) return

  // 2. Usamos Capacitor Dialog para mostrar una ventana de confirmación
  const { value } = await Dialog.confirm({
    title: 'Confirmar Cancelación',
    message: '¿Estás seguro de que quieres cancelar el viaje?',
    okButtonTitle: 'Sí, Cancelar',
    cancelButtonTitle: 'No',
  })

  // 3. Si el usuario presiona "Sí, Cancelar" (value es true), procedemos
  if (value) {
    try {
      // 4. Se realiza la llamada a la API para cancelar el viaje en el backend
      const response = await axios.post(
        `${import.meta.env.VITE_BACKEND_URL}/api/trips/${rideId.value}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${authStore.user.token}` } },
      )

      // El listener del socket se encargará de actualizar la UI, por lo que no es
      // necesario llamar a updateUIFromState() aquí para evitar duplicidad.
      updateUIFromState('CANCELLED', response.data)
    } catch (error) {
      console.error('Error canceling ride:', error)
      // Mostramos un error si la API falla
      await Dialog.alert({
        title: 'Error',
        message: 'No se pudo cancelar el viaje. Inténtalo de nuevo.',
        buttonTitle: 'Entendido',
      })
    }
  }
  // Si el usuario presiona "No", no se hace nada y la función termina.
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
        <div
          v-if="appState === 'idle'"
          key="idle"
          class="relative bg-white rounded-xl shadow-2xl p-5 max-w-md mx-auto space-y-4"
        >
          <div class="absolute top-4 right-4">
            <router-link
              to="/history"
              class="px-2 rounded-full hover:bg-gray-100 transition-colors block"
            >
              History
            </router-link>
          </div>

          <div>
            <label for="pickup" class="block text-sm font-medium text-gray-700">Pick up from</label>
            <input
              type="text"
              id="pickup"
              v-model="pickupAddress"
              placeholder="Drag marker to set pickup"
              class="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
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
            <label for="indications" class="block text-sm font-medium text-gray-700"
              >Indicaciones DIR recogida</label
            >
            <input
              type="text"
              id="indications"
              v-model="userIndications"
              placeholder="e.g., building with a red door"
              class="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          <button
            @click="requestRide"
            :disabled="!destinationAddress || !!statusMessage || isRequesting"
            class="w-full bg-black text-white font-bold py-3 px-12 rounded-lg shadow-lg hover:bg-gray-800 transition-transform transform hover:scale-105 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            {{ isRequesting ? 'Buscando conductor...' : 'Solicitar Viaje' }}
          </button>
        </div>
        <div
          v-else-if="appState === 'REQUESTED'"
          key="requested"
          class="bg-white rounded-xl shadow-2xl p-5 max-w-md mx-auto text-center"
        >
          <h2 class="text-xl font-bold text-gray-800">Buscando tu viaje...</h2>
          <p class="text-gray-500 mt-2 mb-6">Estamos buscando el conductor más cercano.</p>

          <div class="flex justify-center my-4">
            <svg
              class="animate-spin -ml-1 mr-3 h-8 w-8 text-black"
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
          </div>

          <button
            @click="cancelRide"
            class="w-full bg-red-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-red-600 transition"
          >
            Cancelar Búsqueda
          </button>
        </div>
        <div
          v-else-if="(appState === 'ACCEPTED' || appState === 'IN_PROGRESS') && assignedDriver"
          key="in-progress"
          class="relative bg-white rounded-xl shadow-2xl p-5 max-w-md mx-auto"
        >
          <div class="absolute top-4 right-4">
            <router-link
              to="/history"
              class="p-2 rounded-full hover:bg-gray-100 transition-colors block"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </router-link>
          </div>

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
        v-if="showModal"
        class="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[5000]"
      >
        <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center">
          <h3 class="text-xl font-bold text-gray-800 mb-2">{{ modalTitle }}</h3>

          <p class="text-gray-600 mb-6">{{ modalMessage }}</p>

          <button
            @click="showModal = false"
            class="bg-black text-white font-bold py-3 px-8 rounded-lg w-full hover:bg-gray-800 transition"
          >
            Entendido
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
