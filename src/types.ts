import type { Marker } from 'leaflet'
export interface GeoJSONPoint {
  type: 'Point'
  coordinates: [number, number]
}

export type AppState = 'idle' | 'REQUESTED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export interface Car {
  model: string
  color: string
  plate: string
}

export interface Driver {
  _id: string
  firstName: string
  lastName: string
  profileImageUrl?: string
  averageRating: number
  car?: Car
  location?: GeoJSONPoint
  marker?: Marker
}

export interface Trip {
  _id: string
  riderId: string
  driverId?: Driver | string // Can be a populated Driver object or just an ID

  // Location Info
  pickupLocation: GeoJSONPoint
  dropoffLocation?: GeoJSONPoint
  pickupName?: string
  destinationName?: string

  // Status and Financials
  status: AppState
  estimatedFare?: number
  actualFare?: number
  paymentStatus: 'pending' | 'succeeded' | 'failed'

  // Timestamps
  createdAt?: string
  updatedAt?: string
  tripStartTime?: string
  tripEndTime?: string
}
