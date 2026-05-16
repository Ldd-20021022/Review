import { get, post, put } from './client.js'

export function listAssessments(status) {
  return get('/api/assessments/', status ? { status } : null)
}

export function createAssessment(data) {
  return post('/api/assessments/', data)
}

export function getAssessment(id) {
  return get(`/api/assessments/${id}`)
}

export function myDepartmentAssessments() {
  return get('/api/assessments/my-department')
}

export function updateScore(assessmentId, itemId, data) {
  return put(`/api/assessments/${assessmentId}/items/${itemId}`, data)
}

export function submitAssessment(id) {
  return post(`/api/assessments/${id}/submit`)
}

export function resubmitAssessment(id) {
  return post(`/api/assessments/${id}/resubmit`)
}

export function lockAssessment(id) {
  return post(`/api/assessments/${id}/lock`)
}

export function approveAssessment(id) {
  return post(`/api/assessments/${id}/approve`)
}

export function rejectAssessment(id, feedback) {
  return post(`/api/assessments/${id}/reject`, { feedback })
}
