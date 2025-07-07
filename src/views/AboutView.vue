<template>
  <div id="map"></div>
  <button @click="removeLastMarker">Remove Last Marker</button>
</template>

<script setup>
import leaflet from 'leaflet'
import { onMounted, ref } from 'vue'

// Use ref to hold the map and marker instances so they can be accessed outside onMounted
const map = ref(null)
const marker = ref(null)

onMounted(() => {
  // Initialize the map
  map.value = leaflet.map('map').setView([5.5446, -73.3576], 13)

  // Add the tile layer
  leaflet
    .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
    .addTo(map.value)

  // Create a marker and add it to the map, storing it in the ref
  marker.value = leaflet.marker([5.5226948, -73.367617]).addTo(map.value)
  marker.value = leaflet.marker([5.5257229, -73.3719578]).addTo(map.value)
  marker.value = leaflet.marker([5.5193971, -73.3573907]).addTo(map.value)
  marker.value = leaflet.marker([5.5255528, -73.3725329]).addTo(map.value)
  marker.value = leaflet.marker([5.5201272, -73.3597559]).addTo(map.value)
})

// Define the function to remove the marker
const removeLastMarker = () => {
  if (marker.value && map.value) {
    // Option 1: Call remove() on the marker instance (preferred)

    // Option 2: Use removeLayer() on the map instance
    map.value.removeLayer(marker.value)

    console.log('Marker removed')
  }
}
</script>

<style>
#map {
  height: 90vh;
  width: 100%;
}
</style>
