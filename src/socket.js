import { io } from 'socket.io-client'

const socketBaseUrl = import.meta.env.DEV
  ? 'http://localhost:8800'
  : 'https://todobackend-2-afpf.onrender.com'

let socketInstance = null

export const getSocket = (token) => {
  if (!token) return null

  if (!socketInstance) {
    socketInstance = io(socketBaseUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      auth: { token }
    })
  }

  socketInstance.auth = { token }
  if (!socketInstance.connected) {
    socketInstance.connect()
  }

  return socketInstance
}

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect()
  }
}
