import { get } from './client.js'

export function listSnapshots(assessmentId) {
  return get('/api/snapshots/', assessmentId ? { assessment_id: assessmentId } : null)
}

export function getSnapshot(id) {
  return get(`/api/snapshots/${id}`)
}

export function compareSnapshots(snap1Id, snap2Id) {
  return get(`/api/snapshots/compare/?snap1=${snap1Id}&snap2=${snap2Id}`)
}

export function previewReport(snapshotId) {
  return get(`/api/reports/preview/${snapshotId}`)
}

export function downloadReportUrl(snapshotId) {
  return `http://localhost:8000/api/reports/download/${snapshotId}`
}
