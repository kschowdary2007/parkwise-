import api from './client'

const root = '/ai/vehicle-detections'

export const getDetectionSummary = (days = 1) => api.get(`${root}/summary`, { params: { days } })
export const getDetectionHistory = (limit = 50) => api.get(`${root}/history`, { params: { limit } })
export const getYoloEvaluation = () => api.get(`${root}/evaluation`)
export const getYoloComparison = () => api.get(`${root}/comparison`)
export const getConfiguredCameras = () => api.get(`${root}/cameras`)
export const evaluateYoloModels = (split = 'test') => api.post(`${root}/evaluate`, null, { params: { split }, timeout: 3600000 })

export const detectImage = (file, cameraId = 'upload', modelName) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`${root}/image`, form, {
    params: { camera_id: cameraId, ...(modelName ? { model_name: modelName } : {}) },
    timeout: 120000,
  })
}

export const detectVideo = (file, cameraId = 'upload', modelName) => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`${root}/video`, form, {
    params: { camera_id: cameraId, ...(modelName ? { model_name: modelName } : {}) },
    timeout: 600000,
  })
}

export const detectCameraFrame = (cameraId, modelName) => api.post(
  `${root}/cameras/${encodeURIComponent(cameraId)}/frame`,
  null,
  { params: modelName ? { model_name: modelName } : {}, timeout: 30000 },
)
