import { get, post, put } from './client.js'

export function listTasks(params) { return get('/api/tasks/', params) }
export function createTasks(data) { return post('/api/tasks/', data) }
export function getTask(id) { return get(`/api/tasks/${id}`) }
export function updateTask(id, data) { return put(`/api/tasks/${id}`, data) }
export function startTask(id) { return post(`/api/tasks/${id}/start`) }
export function submitTask(id) { return post(`/api/tasks/${id}/submit`) }
export function acceptTask(id) { return post(`/api/tasks/${id}/accept`) }
export function returnTask(id, reason) { return post(`/api/tasks/${id}/return`, { reason: reason || '' }) }
export function addComment(id, content) { return post(`/api/tasks/${id}/comments`, { content }) }
