import { defineComponent, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'

const menuItems = [
  { path: '/hospital-rating/dashboard', title: '📊 综合仪表盘', roles: ['admin', 'director', 'expert', 'leader'] },
  { path: '/hospital-rating/form', title: '📋 数据填报', roles: ['admin', 'director', 'expert', 'dept_head'] },
  { path: '/hospital-rating/reports', title: '📄 评级报告', roles: ['admin', 'director', 'expert', 'leader', 'dept_head'] },
  { path: '/hospital-rating/standards', title: '📐 标准库管理', roles: ['admin'] },
]

const roleLabels = {
  admin: '管理员',
  director: '院长',
  expert: '评级专家',
  dept_head: '科室负责人',
  leader: '院领导',
}

export default defineComponent({
  name: 'HRLayout',
  setup() {
    const router = useRouter()
    const route = useRoute()
    const auth = useAuthStore()

    auth.fetchMe()

    const visibleMenus = computed(() =>
      menuItems.filter(m => m.roles.includes(auth.user?.role))
    )

    function handleSelect(path) {
      if (path) router.push(path)
    }

    function handleLogout() {
      auth.logout()
      router.push('/login')
    }

    return { route, auth, visibleMenus, handleSelect, handleLogout, roleLabels }
  },
  template: `
<el-container style="min-height:100vh">
  <el-aside width="200px" style="background:#1e293b">
    <div style="padding:16px 12px;font-weight:700;font-size:15px;color:#fff;border-bottom:1px solid #334155">
      🏥 三甲评级系统
    </div>
    <el-menu
      :default-active="route.path"
      background-color="#1e293b"
      text-color="#94a3b8"
      active-text-color="#60a5fa"
      @select="handleSelect"
    >
      <el-menu-item v-for="m in visibleMenus" :key="m.path" :index="m.path">
        <span>{{ m.title }}</span>
      </el-menu-item>
    </el-menu>
  </el-aside>
  <el-container>
    <el-header style="background:#fff;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:flex-end;height:52px;padding:0 24px;gap:16px">
      <span style="font-size:13px;color:#64748b">
        <strong>{{ auth.user?.name || '' }}</strong>
        <el-tag size="small" style="margin-left:8px">{{ roleLabels[auth.user?.role] || '' }}</el-tag>
      </span>
      <el-button text @click="handleLogout" style="color:#94a3b8">退出</el-button>
    </el-header>
    <el-main style="background:#f8fafc">
      <router-view />
    </el-main>
  </el-container>
</el-container>
`,
})
