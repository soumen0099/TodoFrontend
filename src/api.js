import axios from 'axios'

const productionApiUrl = 'https://todobackend-2-afpf.onrender.com/api'

// In development: use /api (proxied to localhost:8800 by vite.config.js)
// In production: use direct Render backend URL
const baseURL = import.meta.env.DEV 
  ? '/api'
  : productionApiUrl

const api = axios.create({ baseURL })

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
