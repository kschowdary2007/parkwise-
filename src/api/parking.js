import api from './client'

export const getParkingSpaces = () => api.get('/parking/spaces')
export const updateParkingSpace = (id, payload) => api.patch(`/parking/spaces/${id}`, payload)
export const getParkingRecommendation = (params = {}) => api.get('/parking/recommend', { params })
export const getPricingCurrent = () => api.get('/pricing/current')
export const createReservation = (payload) => api.post('/reservations', payload)
