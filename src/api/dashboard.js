import api from './client'

export const getDashboardSummary = () => api.get('/dashboard/summary')
export const getAnalyticsDemand = () => api.get('/analytics/demand')
export const getAnalyticsOccupancy = () => api.get('/analytics/occupancy')
export const getAnalyticsRevenue = () => api.get('/analytics/revenue')
