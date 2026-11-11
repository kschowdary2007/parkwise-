import api from './client'

export const getPayments = () => api.get('/payments')
export const createPayment = (payload) => api.post('/payments', payload)
