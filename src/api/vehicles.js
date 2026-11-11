import api from './client'

export const getVehicles = () => api.get('/vehicles')
export const createVehicle = (payload) => api.post('/vehicles', payload)
export const updateVehicle = (id, payload) => api.put(`/vehicles/${id}`, payload)
