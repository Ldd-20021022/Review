import { reactive } from 'vue'
import { login as loginApi, getMe } from '../api/auth.js'

// Plain reactive store (no Pinia dependency)
const state = reactive({
  user: null,
  token: localStorage.getItem('token') || '',
})

export const useAuthStore = () => ({
  get user() { return state.user },
  get token() { return state.token },
  get isLoggedIn() { return !!state.token },

  async loginAction(phone, password) {
    const res = await loginApi(phone, password)
    state.token = res.access_token
    localStorage.setItem('token', state.token)
    state.user = res.user
    localStorage.setItem('user', JSON.stringify(res.user))
    return state.user
  },

  async fetchMe() {
    if (!state.token) return null
    try {
      const res = await getMe()
      state.user = res
      localStorage.setItem('user', JSON.stringify(res))
      return state.user
    } catch {
      this.logout()
      return null
    }
  },

  logout() {
    state.token = ''
    state.user = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  },
})
