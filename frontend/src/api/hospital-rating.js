import { get, post } from './client.js'

export function getDashboard() {
  return get('/api/hospital-ratings/dashboard')
}

export function submitRating(data) {
  return post('/api/hospital-ratings/submit', data)
}

export function getMyRatings() {
  return get('/api/hospital-ratings/my-department')
}

export function getReport(id) {
  return get(`/api/hospital-ratings/report/${id}`)
}

export function approveRating(id) {
  return post(`/api/hospital-ratings/${id}/approve`)
}

export function rejectRating(id, feedback) {
  return post(`/api/hospital-ratings/${id}/reject`, { feedback })
}

export function getStandards() {
  return get('/api/hospital-ratings/standards')
}
