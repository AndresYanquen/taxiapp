<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
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
import SideMenu from '@/components/Rider/SideMenu.vue'

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
const selectedCarType = ref('standard')

type CarOption = {
  id: string
  label: string
  desc: string
  eta: string
  badge: string
}

const carOptions: CarOption[] = [
  {
    id: 'standard',
    label: 'City',
    desc: 'Rápido y económico',
    eta: '2-4 min',
    badge: '3 pax',
  },
  {
    id: 'premium',
    label: 'Comfort',
    desc: 'Autos amplios y silenciosos',
    eta: '5-7 min',
    badge: 'Lujo',
  },
  {
    id: 'xl',
    label: 'XL',
    desc: 'Ideal para grupos grandes',
    eta: '6-9 min',
    badge: '6 pax',
  },
]

const stageLabels = ['Ubicación', 'Buscando', 'En camino']

const activeStage = computed(() => {
  if (['ACCEPTED', 'IN_PROGRESS'].includes(appState.value)) return 2
  if (appState.value === 'REQUESTED') return 1
  return 0
})

const selectedCarSummary = computed(() =>
  carOptions.find((option) => option.id === selectedCarType.value),
)

const selectCarType = (type: string) => {
  selectedCarType.value = type
}

const isCollapsed = ref(false)
const isSheetMinimized = ref(false)
const isPickupSelectionActive = ref(false)
const showMapTooltip = ref(false)

const isUpdatingMarkerFromMap = ref(false)

const setMarkerAtMapCenter = () => {
  if (!map.value || !riderMarker.value) return
  const center = map.value.getCenter()
  riderMarker.value.setLatLng(center)
}

const togglePanel = () => {
  isCollapsed.value = !isCollapsed.value
}

const toggleSheetVisibility = () => {
  isSheetMinimized.value = !isSheetMinimized.value
  if (!isSheetMinimized.value) {
    isCollapsed.value = false
  }
}

const expandSheet = () => {
  isSheetMinimized.value = false
  isCollapsed.value = false
}

const startPickupSelectionFromMap = () => {
  isPickupSelectionActive.value = true
  isSheetMinimized.value = true
  showMapTooltip.value = true
  if (map.value && riderMarker.value) {
    setMarkerAtMapCenter()
    map.value.panTo(map.value.getCenter(), { animate: true })
    riderMarker.value.openPopup()
  }
}

const finalizePickupSelection = () => {
  if (!map.value || !riderMarker.value) return
  const center = map.value.getCenter()
  riderMarker.value.setLatLng(center)
  reverseGeocode(center)
  riderMarker.value.openPopup()
  isPickupSelectionActive.value = false
  isSheetMinimized.value = false
  showMapTooltip.value = false
}

const confirmPickupSelection = () => {
  if (!isPickupSelectionActive.value) return
  finalizePickupSelection()
}

const handleMapMoveDuringSelection = () => {
  if (!isPickupSelectionActive.value || isUpdatingMarkerFromMap.value) return
  isUpdatingMarkerFromMap.value = true
  requestAnimationFrame(() => {
    setMarkerAtMapCenter()
    isUpdatingMarkerFromMap.value = false
  })
}

const handleMapClickForPickup = () => {
  if (!isPickupSelectionActive.value) return
  finalizePickupSelection()
}

watch(
  () => appState.value,
  (state) => {
    if (state !== 'idle') {
      isSheetMinimized.value = false
    }
  },
)

watch(isPickupSelectionActive, (active) => {
  if (riderMarker.value?.dragging) {
    active ? riderMarker.value.dragging.disable() : riderMarker.value.dragging.enable()
  }
})

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
  if (map.value) {
    map.value.off('click', handleMapClickForPickup)
    map.value.off('move', handleMapMoveDuringSelection)
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
        statusMessage.value = `${driver.name ? driver.name : 'El conductor'} está en camino!`

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
      selectedCarType.value = 'standard'
      isRequesting.value = false
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

  map.value.on('click', handleMapClickForPickup)
  map.value.on('move', handleMapMoveDuringSelection)

  // Update address when marker is dragged
  riderMarker.value.on('dragend', (event) => {
    const marker = event.target
    const position = marker.getLatLng()
    isPickupSelectionActive.value = false
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

const handleLogout = async () => {
  // 1. Disconnect the socket if it's connected
  if (socket) {
    socket.disconnect()
  }
  // 2. Clear any local state or intervals
  if (pollingInterval) {
    clearInterval(pollingInterval)
  }
  // 3. Call the logout action from the Pinia store
  authStore.logout()
  // 4. Redirect the user to the login page
  router.push('/login')
}
</script>

<template>
  <div id="app-wrapper">
    <div id="map" ref="mapContainer"></div>
    <SideMenu></SideMenu>

    <transition name="fade">
      <button
        v-if="isPickupSelectionActive"
        class="pointer-events-auto fixed bottom-32 left-1/2 z-[1400] -translate-x-1/2 rounded-full border border-white/20 bg-emerald-500 px-6 py-2 text-sm font-semibold uppercase tracking-wide text-gray-900 shadow-xl sm:bottom-36"
        @click="confirmPickupSelection"
      >
        Confirmar ubicación
      </button>
    </transition>

    <div
      v-if="!showMapTooltip"
      class="ui-container-tooltip absolute top-6 left-1/2 z-[1200] w-full max-w-lg -translate-x-1/2 px-6"
    >
      <transition name="fade">
        <div
          v-if="statusMessage"
          class="flex items-center gap-3 rounded-3xl border border-white/15 bg-gray-900/80 px-5 py-4 text-white shadow-2xl backdrop-blur"
        >
          <span
            class="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300"
          >
            <i class="pi pi-compass text-xl"></i>
          </span>
          <div>
            <p class="text-[11px] uppercase tracking-[0.35em] text-emerald-200">Actualización</p>
            <p class="text-sm font-semibold text-white">{{ statusMessage }}</p>
          </div>
        </div>
      </transition>
    </div>

    <div
      class="ui-container pointer-events-none absolute bottom-4 left-0 z-20 w-full px-3 sm:bottom-6 sm:px-4"
    >
      <transition name="fade">
        <div
          v-if="!isSheetMinimized && !isPickupSelectionActive"
          class="pointer-events-auto mx-auto flex w-full max-w-md flex-col space-y-4 rounded-[26px] border border-white/10 bg-gradient-to-br from-gray-900/95 via-gray-900/85 to-gray-900/70 p-4 shadow-[0_30px_80px_-45px_rgba(16,185,129,0.65)] backdrop-blur max-h-[80vh] sm:max-w-xl sm:space-y-5 sm:rounded-[32px] sm:p-6 sm:max-h-none"
        >
          <button
            class="mx-auto flex h-8 w-14 items-center justify-center rounded-full bg-white/10 sm:hidden"
            @click="toggleSheetVisibility"
          >
            <span class="h-1.5 w-8 rounded-full bg-white/40"></span>
          </button>

          <div v-if="isSheetMinimized && !isPickupSelectionActive" class="flex flex-wrap items-center justify-between gap-3">
            <div class="space-y-1">
              <p class="text-[11px] uppercase tracking-[0.35em] text-emerald-200">Planifica</p>
              <h3 class="text-xl font-semibold leading-tight text-white">Planifica tu viaje</h3>
              <p class="text-xs text-gray-400 sm:text-sm">
                Selecciona tu punto de partida y destino para conectar con el conductor ideal.
              </p>
            </div>
            <div class="flex items-center gap-2">
              <RouterLink
                to="/history"
                class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-200 transition hover:border-emerald-400 hover:text-white"
              >
                <i class="fa-solid fa-clock-rotate-left text-sm"></i>
                Historial
              </RouterLink>
              <button
                type="button"
                class="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:border-emerald-400 hover:text-emerald-300"
                @click="togglePanel"
              >
                <i :class="isCollapsed ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"></i>
              </button>
            </div>
          </div>

          <transition name="fade" mode="out-in">
            <section
              v-show="!isCollapsed"
              class="space-y-4 overflow-auto pr-1 sm:space-y-5 sm:overflow-visible sm:pr-0"
            >
              <div v-if="isSheetMinimized && !isPickupSelectionActive" class="flex flex-wrap items-center gap-2 text-[11px]">
                <template v-for="(label, index) in stageLabels" :key="label">
                  <div class="flex items-center gap-2">
                    <span
                      :class="[
                        'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold',
                        index <= activeStage
                          ? 'bg-emerald-400 text-gray-900'
                          : 'bg-white/10 text-gray-500',
                      ]"
                    >
                      {{ index + 1 }}
                    </span>
                    <span
                      :class="[
                        'font-semibold tracking-wide',
                        index <= activeStage ? 'text-white' : 'text-gray-500',
                      ]"
                    >
                      {{ label }}
                    </span>
                  </div>
                  <div
                    v-if="index < stageLabels.length - 1"
                    class="hidden h-px flex-1 bg-white/10 sm:block"
                  ></div>
                </template>
              </div>

              <div
                v-if="appState === 'idle'"
                key="idle"
                class="space-y-4 rounded-3xl border border-white/5 bg-black/10 p-4 sm:space-y-5"
              >
                <div class="space-y-3">
                  <div
                    class="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 transition focus-within:border-emerald-400"
                  >
                    <div class="flex items-start gap-3">
                      <div
                        class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300"
                      >
                        <i class="pi pi-map-marker text-base"></i>
                      </div>
                      <div class="flex-1">
                        <div class="flex items-center justify-between">
                          <p class="text-[11px] uppercase tracking-wide text-gray-400">
                            Punto de partida
                          </p>
                          <button
                            type="button"
                            class="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200 transition hover:border-emerald-300 hover:text-white"
                            @click="startPickupSelectionFromMap"
                          >
                            Desde mapa
                          </button>
                        </div>
                        <input
                          type="text"
                          id="pickup"
                          v-model="pickupAddress"
                          placeholder="Arrastra el marcador en el mapa"
                          class="w-full border-none bg-transparent p-0 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-0 sm:text-sm"
                        />
                        <p class="mt-1 text-[10px] text-gray-500">
                          Mueve el mapa con el marcador centrado para ajustar tu punto de partida.
                        </p>
                        <p
                          v-if="isPickupSelectionActive"
                          class="mt-1 text-[11px] font-semibold text-emerald-300"
                        >
                          Mantén el cursor en el centro y arrastra el mapa. Toca el mapa para
                          confirmar.
                        </p>
                        <button
                          v-if="isPickupSelectionActive"
                          type="button"
                          class="mt-3 inline-flex items-center justify-center rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200 hover:bg-emerald-400/30"
                          @click="confirmPickupSelection"
                        >
                          Confirmar ubicación
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="grid gap-3 sm:grid-cols-2">
                    <div
                      class="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 transition focus-within:border-emerald-400"
                    >
                      <div class="flex items-start gap-3">
                        <div
                          class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-emerald-200"
                        >
                          <i class="pi pi-flag text-base"></i>
                        </div>
                        <div class="flex-1">
                          <p class="text-[11px] uppercase tracking-wide text-gray-400">
                            ¿Dónde te diriges?
                          </p>
                          <input
                            type="text"
                            id="destination"
                            v-model="destinationAddress"
                            placeholder="Introduce la dirección de destino"
                            class="w-full border-none bg-transparent p-0 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-0 sm:text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <div
                      class="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 transition focus-within:border-emerald-400"
                    >
                      <div class="flex items-start gap-3">
                        <div
                          class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-emerald-200"
                        >
                          <i class="pi pi-comment text-base"></i>
                        </div>
                        <div class="flex-1">
                          <div class="flex items-center justify-between">
                            <p class="text-[11px] uppercase tracking-wide text-gray-400">
                              Indicaciones
                            </p>
                            <span class="text-[10px] text-gray-500">Opcional</span>
                          </div>
                          <textarea
                            id="indications"
                            v-model="userIndications"
                            rows="2"
                            placeholder="p. ej. portería gris, apartamento 502"
                            class="mt-1 w-full resize-none border-none bg-transparent p-0 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-0 sm:text-sm"
                          ></textarea>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="space-y-3">
                  <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Preferencia de vehículo
                  </p>
                  <div class="grid gap-2 sm:grid-cols-3">
                    <button
                      v-for="option in carOptions"
                      :key="option.id"
                      type="button"
                      @click="selectCarType(option.id)"
                      :class="[
                        'rounded-2xl border px-3 py-3 text-left text-xs transition',
                        selectedCarType === option.id
                          ? 'border-emerald-400 bg-emerald-500/10 text-white'
                          : 'border-white/10 bg-white/5 text-gray-200 hover:border-emerald-300/60',
                      ]"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-sm font-semibold">{{ option.label }}</span>
                        <span
                          class="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-gray-300"
                        >
                          {{ option.badge }}
                        </span>
                      </div>
                      <p class="text-[11px] text-gray-400">{{ option.desc }}</p>
                      <p class="text-[11px] font-semibold text-emerald-300">{{ option.eta }}</p>
                    </button>
                  </div>
                </div>

                <button
                  @click="requestRide"
                  :disabled="!destinationAddress || !!statusMessage || isRequesting"
                  class="w-full rounded-2xl border border-transparent bg-gradient-to-r from-emerald-400 to-teal-400 px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-gray-900 transition hover:from-emerald-300 hover:to-teal-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {{ isRequesting ? 'Buscando conductor...' : 'Solicitar viaje' }}
                </button>
              </div>

              <div
                v-else-if="appState === 'REQUESTED'"
                key="requested"
                class="space-y-4 rounded-3xl border border-white/5 bg-black/20 px-5 py-6 text-center sm:space-y-5"
              >
                <div class="space-y-3">
                  <p class="text-xs uppercase tracking-[0.35em] text-emerald-200">Buscando</p>
                  <h2 class="text-2xl font-black text-white">Encontrando el mejor conductor</h2>
                  <p class="text-sm text-gray-300">
                    Estamos verificando conductores cercanos a tu ubicación. Esto tarda solo unos
                    segundos.
                  </p>
                </div>

                <div class="flex justify-center">
                  <svg
                    class="h-12 w-12 animate-spin text-emerald-300"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      class="opacity-20"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                    />
                    <path
                      class="opacity-90"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                </div>

                <button
                  @click="cancelRide"
                  class="w-full rounded-2xl border border-transparent bg-red-500 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-gray-950"
                >
                  Cancelar búsqueda
                </button>
              </div>

              <div
                v-else-if="
                  (appState === 'ACCEPTED' || appState === 'IN_PROGRESS') && assignedDriver
                "
                key="in-progress"
                class="space-y-4 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-6 shadow-[0_30px_80px_-45px_rgba(16,185,129,0.75)] sm:space-y-5"
              >
                <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div
                    class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-3xl"
                  >
                    🚗
                  </div>
                  <div class="space-y-1">
                    <p class="text-xs uppercase tracking-[0.35em] text-emerald-200">
                      Conductor en camino
                    </p>
                    <h2 class="text-xl font-semibold text-white">
                      {{ assignedDriver.name }} está en camino
                    </h2>
                    <p v-if="assignedDriver.car" class="text-sm text-emerald-50">
                      {{ assignedDriver.car.model }} • {{ assignedDriver.car.color }}
                    </p>
                    <p
                      v-if="assignedDriver.car"
                      class="inline-flex items-center gap-2 rounded-xl border border-emerald-300/60 bg-white/10 px-4 py-1 text-sm font-semibold text-white"
                    >
                      {{ assignedDriver.car.plate }}
                    </p>
                  </div>
                </div>

                <p class="text-sm text-emerald-50">
                  Sigue el mapa para conocer el progreso del conductor. Recibirás una notificación
                  cuando esté en tu punto de partida.
                </p>

                <button
                  @click="cancelRide"
                  class="w-full rounded-2xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-emerald-500/30"
                >
                  Cancelar viaje
                </button>
              </div>
            </section>
          </transition>
        </div>
      </transition>

      <button
        v-if="!isSheetMinimized && !isPickupSelectionActive"
        @click="toggleSheetVisibility"
        class="pointer-events-auto mx-auto mt-3 flex h-9 w-24 items-center justify-center gap-2 rounded-full border border-white/15 bg-black/70 text-[11px] font-semibold uppercase tracking-wide text-white shadow-lg sm:hidden"
      >
        <i class="pi pi-chevron-down text-xs"></i>
        Ocultar
      </button>

      <div
        v-if="isSheetMinimized && !isPickupSelectionActive && !showMapTooltip"
        class="pointer-events-auto mx-auto w-full max-w-sm rounded-full border border-white/15 bg-gray-900/85 px-4 py-3 text-white shadow-lg sm:hidden"
      >
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-[11px] uppercase tracking-wide text-gray-400">
              {{ isPickupSelectionActive ? 'Selecciona en el mapa' : 'Destino' }}
            </p>
            <p class="text-sm font-semibold text-white">
              {{
                isPickupSelectionActive
                  ? 'Arrastra o toca el mapa para fijar tu punto de partida'
                  : destinationAddress || 'Añade destino'
              }}
            </p>
          </div>
          <button
            @click="expandSheet"
            class="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200"
          >
            <i class="pi pi-chevron-up text-xs"></i>
            Abrir
          </button>
        </div>
        <p v-if="isPickupSelectionActive" class="mt-2 text-[11px] text-emerald-200">
          Desplaza el marcador o toca el mapa para confirmar tu punto de partida.
        </p>
        <button
          v-if="isPickupSelectionActive"
          @click="confirmPickupSelection"
          class="mt-3 w-full rounded-full bg-emerald-500/80 py-2 text-sm font-semibold uppercase tracking-wide text-gray-900"
        >
          Confirmar ubicación
        </button>
      </div>
    </div>

    <!-- LOCATION ERROR MODAL -->
    <transition name="fade">
      <div
        v-if="showModal"
        class="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 p-4"
      >
        <div class="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl">
          <h3 class="mb-2 text-xl font-bold text-gray-800">{{ modalTitle }}</h3>

          <p class="mb-6 text-gray-600">{{ modalMessage }}</p>

          <button
            @click="showModal = false"
            class="w-full rounded-lg bg-black py-3 px-8 font-bold text-white transition hover:bg-gray-800"
          >
            Entendido
          </button>
        </div>
      </div>
    </transition>

    <!-- MAP TOOLTIP -->
    <transition name="fade">
      <div
        v-if="showMapTooltip"
        class="pointer-events-none absolute inset-0 z-[1500] flex items-center justify-center px-6"
      >
        <div
          class="pointer-events-auto max-w-xs rounded-2xl border border-white/20 bg-gray-900/90 p-4 text-center text-white shadow-2xl"
        >
          <p class="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Selecciona tu punto
          </p>
          <p class="mt-1 text-xs text-gray-100">
            Mantén el marcador en el centro, mueve el mapa hasta tu ubicación deseada y presiona
            <span class="font-semibold text-emerald-300">Confirmar ubicación</span>.
          </p>
          <button
            class="mt-3 w-full rounded-xl bg-emerald-500/80 py-2 text-sm font-semibold text-gray-900"
            @click="showMapTooltip = false"
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
  z-index: 100;
}
.ui-container-tooltip {
  z-index: 101;
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

.collapse-enter-active,
.collapse-leave-active {
  transition:
    max-height 0.25s ease,
    opacity 0.2s ease,
    padding 0.25s ease;
}
.collapse-enter-from,
.collapse-leave-to {
  max-height: 0;
  opacity: 0;
  /* optional if you want tighter collapsed padding:
     padding-top: 0; padding-bottom: 0; */
}
.collapse-enter-to,
.collapse-leave-from {
  max-height: 100px; /* sufficiently large */
  opacity: 1;
}
</style>
