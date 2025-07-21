// src/types.ts
// We'll store our custom TypeScript types here for better organization.

import type { Marker } from 'leaflet'

// A more comprehensive state that matches your backend logic
export type AppState =
  | 'idle'
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'finished' // Kept for compatibility if needed

export interface Car {
  model: string
  color: string
  plate: string
}

// Represents a driver in the front-end, including their map marker
export interface Driver {
  _id?: string // From MongoDB
  id?: number // For initial hardcoded data
  name: string
  car: Car
  marker: Marker
}

// Represents a trip object, matching the backend schema
export interface Trip {
  _id: string
  riderId: string
  driverId?: Driver | string // Can be a populated object or just an ID
  pickupLocation: {
    lat: number
    lng: number
  }
  dropoffLocation: {
    lat: number
    lng: number
  }
  status: AppState
  createdAt?: string
}

// This is for the initial hardcoded data before the Leaflet marker is created.
export interface DriverData {
  id: number
  name: string
  car: Car
  position: {
    lat: number
    lng: number
  }
}
