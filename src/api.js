import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

// Automatically attach token to every request
api.interceptors.request.use((config) => {
  const url = config.url || ''
  const isPublicAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register')
  if (isPublicAuthEndpoint) {
    return config
  }

  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
