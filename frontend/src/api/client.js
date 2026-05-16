const BASE_URL = 'http://localhost:8000'

async function request(method, url, data = null) {
  const headers = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const config = { method, headers }
  if (data && method !== 'GET') {
    config.body = JSON.stringify(data)
  }

  let queryUrl = `${BASE_URL}${url}`
  if (data && method === 'GET') {
    const params = new URLSearchParams(data).toString()
    queryUrl += `?${params}`
  }

  const res = await fetch(queryUrl, config)

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg = body.detail || `请求失败 (${res.status})`

    // Auto-logout only for non-login 401s
    if (res.status === 401 && url !== '/api/auth/login') {
      localStorage.removeItem('token')
      window.location.hash = '#/login'
    }

    throw new Error(msg)
  }

  const contentType = res.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return res.json()
  }
  return res
}

export function get(url, params) { return request('GET', url, params) }
export function post(url, data) { return request('POST', url, data) }
export function put(url, data) { return request('PUT', url, data) }
export function del(url) { return request('DELETE', url) }
export function patch(url, data) { return request('PATCH', url, data) }
