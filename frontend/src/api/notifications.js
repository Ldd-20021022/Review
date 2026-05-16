import { get, patch } from './client.js'

export function listNotifications() {
  return get('/api/notifications/')
}

export function markRead(id) {
  return patch(`/api/notifications/${id}/read`)
}

export function unreadCount() {
  return get('/api/notifications/unread-count')
}
