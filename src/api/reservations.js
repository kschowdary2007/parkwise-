import api from './client'

export const getReservations = () => api.get('/reservations')
export const createReservation = (payload) => api.post('/reservations', payload)
export const cancelReservation = (id) => api.delete(`/reservations/${id}`)
