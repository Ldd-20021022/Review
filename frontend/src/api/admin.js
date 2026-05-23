import { get, post, put, del } from './client.js'

// Tenants
export function listTenants() { return get('/api/tenants/') }
export function createTenant(data) { return post('/api/tenants/', data) }
export function updateTenant(id, data) { return put(`/api/tenants/${id}`, data) }

// Departments
export function listDepartments() { return get('/api/departments/') }
export function createDepartment(data) { return post('/api/departments/', data) }
export function updateDepartment(id, data) { return put(`/api/departments/${id}`, data) }
export function deleteDepartment(id) { return del(`/api/departments/${id}`) }

// Users
export function listUsers() { return get('/api/users/') }
export function addUser(data) { return post('/api/users/', data) }
export function updateUserRole(id, role, deptId) {
  return put(`/api/users/${id}`, { role, dept_id: deptId || null })
}
export function removeUser(id) { return del(`/api/users/${id}`) }
