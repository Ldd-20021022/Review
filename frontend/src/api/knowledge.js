import { get } from './client.js'

export function searchRegulations(q) { return get('/api/knowledge/regulations', { q }) }
export function searchCases(indicator, category) { return get('/api/knowledge/cases', { indicator, category }) }
export function getCase(id) { return get('/api/knowledge/cases/' + id) }
