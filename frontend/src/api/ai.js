import { get } from './client.js'

export function getAISummary(id) { return get('/api/ai/summary/' + id) }
export function getHealthCommissionExport(id) { return get('/api/ai/export/' + id) }
