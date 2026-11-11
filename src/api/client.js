import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 8000,
})

function getErrorMessage(error) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => item?.msg).filter(Boolean)
    if (messages.length) return messages.join('; ')
  }
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return 'The API request timed out. Check the backend connection and try again.'
  }
  if (error.code === 'ERR_CANCELED') return 'The API request was canceled.'
  if (!error.response) {
    return `API connection failed. Could not reach ${api.defaults.baseURL}. Check that the backend is running and reachable.`
  }
  return `API request failed with status ${error.response.status}.`
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(new Error(getErrorMessage(error), { cause: error }))
  },
)

export default api
