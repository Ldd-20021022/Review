import { get } from './client.js'

export function getDirectorDashboard() { return get('/api/dashboard/director') }
export function getOverview(assessmentId) { return get(`/api/dashboard/overview?assessment_id=${assessmentId}`) }
export function getDepartments(assessmentId) { return get(`/api/dashboard/departments?assessment_id=${assessmentId}`) }
export function getDimensions(assessmentId) { return get(`/api/dashboard/dimensions?assessment_id=${assessmentId}`) }
export function getTrend(assessmentId) { return get(`/api/dashboard/trend?assessment_id=${assessmentId}`) }
