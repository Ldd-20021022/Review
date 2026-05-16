import { post, get } from './client.js'

export function login(phone, password) {
  return post('/api/auth/login', { phone, password })
}

export function getMe() {
  return get('/api/auth/me')
}
