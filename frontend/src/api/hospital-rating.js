import { get, post, put } from './client.js'

export function getDashboard() {
  return get('/api/dashboard/director', { set_type: 'hospital_grade' })
}

export function submitRating(data) {
  return post('/api/hospital-ratings/submit', data)
}

export function updateRating(id, data) {
  return put('/api/hospital-ratings/submit/' + id, data)
}

export function getMyRatings() {
  return get('/api/hospital-ratings/my-department')
}

export function getReport(id) {
  return get(`/api/hospital-ratings/report/${id}`)
}

export function approveRating(id) {
  return post(`/api/assessments/${id}/approve`)
}

export function rejectRating(id, feedback) {
  return post(`/api/assessments/${id}/reject`, { feedback })
}

export function getStandards() {
  return get('/api/hospital-ratings/standards')
}

export function compareHistory(deptId) {
  return get('/api/hospital-ratings/compare/' + deptId)
}
