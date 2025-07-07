// src/types.ts
// We'll store our custom TypeScript types here for better organization.

import type { Marker, Polyline } from 'leaflet'

export type AppState = 'idle' | 'requesting' | 'in-progress' | 'finished'

export interface Car {
  model: string
  color: string
  plate: string
}

export interface Driver {
  id: number
  name: string
  car: Car
  marker: Marker
}

// This is for the initial data before the Leaflet marker is created.
export interface DriverData {
  id: number
  name: string
  car: Car
  position: {
    lat: number
    lng: number
  }
}
