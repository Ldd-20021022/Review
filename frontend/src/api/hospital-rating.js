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

export function importAssessmentData(file, cycle) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('rating_cycle', cycle)
  const token = localStorage.getItem('token')
  return fetch('http://localhost:8000/api/hospital-ratings/import-data?' + new URLSearchParams({rating_cycle: cycle}), {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd,
  }).then(r => r.json())
}

export function copyPreviousCycle(cycle) {
  return post('/api/hospital-ratings/copy-previous', { rating_cycle: cycle })
}
