<script setup lang="ts">
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map, NavigationControl, Marker } from 'maplibre-gl'
import { onMounted } from 'vue'

onMounted(() => {
  const map = new Map({
    container: 'map',
    style: 'https://api.maptiler.com/maps/streets-v2/style.json?key=h0Ci9dqekSYNu6E3g84t',
    center: [-73.36778, 5.53528], // long - lat
    zoom: 15,
  })

  const marker = new Marker().setLngLat([-73.3683801, 5.5230844]).addTo(map)

  map.addControl(
    new NavigationControl({
      visualizePitch: true,
    }),
  )
})
</script>

<template>
  <div id="map"></div>
</template>

<style scoped>
#map {
  height: 100vh;
}
</style>
