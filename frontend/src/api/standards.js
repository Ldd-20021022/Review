import { get, post, put, del, BASE_URL } from './client.js'

export function listCategories() {
  return get('/api/standards/categories')
}

export function createCategory(data) {
  return post('/api/standards/categories', data)
}

export function updateCategory(id, data) {
  return put(`/api/standards/categories/${id}`, data)
}

export function deleteCategory(id) {
  return del(`/api/standards/categories/${id}`)
}

export function listIndicators(categoryId) {
  return get('/api/standards/indicators', { category_id: categoryId })
}

export function getIndicator(id) {
  return get(`/api/standards/indicators/${id}`)
}

export function createIndicator(data) {
  return post('/api/standards/indicators', data)
}

export function updateIndicator(id, data) {
  return put(`/api/standards/indicators/${id}`, data)
}

export function deleteIndicator(id) {
  return del(`/api/standards/indicators/${id}`)
}

export function updateRequirements(indicatorId, requirements) {
  return put(`/api/standards/indicators/${indicatorId}/requirements`, requirements)
}

export function importExcel(file) {
  const formData = new FormData()
  formData.append('file', file)
  const token = localStorage.getItem('token')
  return fetch(`${BASE_URL}/api/standards/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  }).then(res => res.json())
}
