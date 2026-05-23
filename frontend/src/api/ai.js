import { get, post } from './client.js'

// ── Synchronous (direct) ──
export function getAISummary(id) { return get('/api/ai/summary/' + id) }
export function getHealthCommissionExport(id) { return get('/api/ai/export/' + id) }
export function aiKnowledgeSearch(q) { return get('/api/knowledge/ai/search', { q }) }
export function aiSuggestCase(indicatorName, problemDesc) { return get('/api/knowledge/ai/suggest-case', { indicator_name: indicatorName, problem_desc: problemDesc || '' }) }
export function aiGeneratePDCAPlan(pid) { return get('/api/pdca/' + pid + '/ai-plan') }
export function aiMeetingSummary(mid) { return get('/api/meetings/' + mid + '/ai-summary') }
export function aiInspectionAnalysis(count, categoryFilter) { return post('/api/inspection/ai-analysis', { count: count || 10, category_filter: categoryFilter || '' }) }

// ── Asynchronous (background task + polling) ──

/**
 * Submit an AI task to background queue. Returns task_id immediately.
 * Then poll with pollTask() until done.
 *
 * type: 'summary' | 'anomalies' | 'gap_analysis' | 'knowledge_search' |
 *       'suggest_case' | 'pdca_plan' | 'meeting_summary' | 'inspection'
 */
export function submitAsyncAI(type, params = {}) {
  return post('/api/ai/async', { type, params })
}

/**
 * Poll a background task. Returns { status: 'running'|'done'|'error', result, error }.
 */
export function pollTask(taskId) {
  return get('/api/tasks/' + taskId)
}

/**
 * Convenience: submit AI task + poll until done.
 * @param {string} type - AI task type
 * @param {object} params - parameters for the AI task
 * @param {function} onProgress - called with { status, elapsed }
 * @param {number} interval - polling interval in ms (default 2000)
 * @param {number} timeout - max wait in ms (default 120000)
 * @returns {object} { result, error, timedOut }
 */
export async function aiAsyncWithPolling(type, params = {}, { onProgress, interval = 2000, timeout = 120000 } = {}) {
  const { task_id } = await submitAsyncAI(type, params)
  if (!task_id) throw new Error('No task_id returned')

  const startTime = Date.now()

  while (true) {
    const elapsed = Date.now() - startTime
    if (elapsed > timeout) {
      return { result: null, error: 'AI 请求超时，请重试', timedOut: true }
    }

    await new Promise(r => setTimeout(r, interval))

    const task = await pollTask(task_id).catch(() => ({ status: 'running' }))

    if (onProgress) onProgress({ status: task.status, elapsed: Math.round(elapsed / 1000) })

    if (task.status === 'done') {
      return { result: task.result, error: null, timedOut: false }
    }

    if (task.status === 'error') {
      return { result: null, error: task.error || 'AI 任务失败', timedOut: false }
    }

    // Adaptive polling: slow down over time
    if (elapsed > 60000) interval = 5000
    else if (elapsed > 30000) interval = 3000
  }
}
