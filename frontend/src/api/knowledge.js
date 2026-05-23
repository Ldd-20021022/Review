import { get } from './client.js'

// 基础检索
export function searchRegulations(q) { return get('/api/knowledge/regulations', { q }) }
export function searchCases(indicator, category) { return get('/api/knowledge/cases', { indicator, category }) }
export function getCase(id) { return get('/api/knowledge/cases/' + id) }

// AI 智能检索 (委托给 ai.js 统一管理)
export { aiKnowledgeSearch, aiSuggestCase } from './ai.js'
