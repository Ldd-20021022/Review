import { defineComponent, ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { unreadCount } from '../api/notifications.js'

// Each menu item: path, title, roles (array of roles that can see it)
const allMenus = [
  { path: '/dashboard', title: '综合仪表盘', roles: ['admin', 'director', 'expert', 'dept_head', 'leader'] },
  { path: '/assessments', title: '评级填报', roles: ['admin', 'director', 'expert', 'dept_head', 'leader'] },
  { path: '/snapshots', title: '评估快照', roles: ['admin', 'expert', 'leader'] },
  { path: '/reports', title: '报告管理', roles: ['admin', 'director', 'expert', 'leader'] },
  { path: '/tasks', title: '整改任务', roles: ['admin', 'director', 'expert', 'dept_head', 'leader'] },
]

const adminMenus = [
  { path: '/admin/standards', title: '标准库管理', roles: ['admin'], platformOnly: false },
  { path: '/admin/departments', title: '科室管理', roles: ['admin'], platformOnly: false },
  { path: '/admin/users', title: '用户管理', roles: ['admin'], platformOnly: false },
  { path: '/admin/tenants', title: '租户管理', roles: ['admin'], platformOnly: true },
]

const roleLabels = {
  admin: '管理员',
  director: '院长',
  expert: '评级专家',
  dept_head: '科室负责人',
  leader: '院领导',
}

export default defineComponent({
  name: 'AppLayout',
  setup() {
    const router = useRouter()
    const route = useRoute()
    const auth = useAuthStore()
    const notifCount = ref(0)
    let timer = null

    auth.fetchMe()

    const visibleMenus = computed(() =>
      allMenus.filter(m => m.roles.includes(auth.user?.role))
    )

    const visibleAdminMenus = computed(() =>
      adminMenus.filter(m => {
        if (!m.roles.includes(auth.user?.role)) return false
        if (m.platformOnly && !auth.user?.is_platform_admin) return false
        return true
      })
    )

    const showAdmin = computed(() => visibleAdminMenus.value.length > 0)

    async function fetchNotifCount() {
      try {
        const res = await unreadCount()
        notifCount.value = res.count || 0
      } catch (_) { /* ignore */ }
    }

    function handleSelect(path) {
      if (path) router.push(path)
    }

    function handleLogout() {
      auth.logout()
      router.push('/login')
    }

    onMounted(() => {
      fetchNotifCount()
      timer = setInterval(fetchNotifCount, 30000) // poll every 30s
    })
    onUnmounted(() => {
      if (timer) clearInterval(timer)
    })

    return {
      route, auth, notifCount, visibleMenus, visibleAdminMenus, showAdmin,
      handleSelect, handleLogout, roleLabels,
    }
  },
  template: `
<el-container style="min-height:100vh">
  <el-aside width="220px" style="background:#1f2d3d">
    <div class="logo">
      <h3 style="color:#fff;text-align:center;padding:16px 0;margin:0">🏥 医院评级系统</h3>
    </div>
    <el-menu
      :default-active="route.path"
      background-color="#1f2d3d"
      text-color="#bfcbd9"
      active-text-color="#409eff"
      @select="handleSelect"
    >
      <el-menu-item v-for="m in visibleMenus" :key="m.path" :index="m.path">
        <span>{{ m.title }}</span>
      </el-menu-item>

      <el-sub-menu v-if="showAdmin" index="admin">
        <template #title>系统管理</template>
        <el-menu-item v-for="m in visibleAdminMenus" :key="m.path" :index="m.path">
          {{ m.title }}
        </el-menu-item>
      </el-sub-menu>
    </el-menu>
  </el-aside>
  <el-container>
    <el-header style="background:#fff;border-bottom:1px solid #e4e7ed;display:flex;align-items:center;justify-content:space-between;height:56px">
      <span>
        <strong>{{ auth.user?.name || '未登录' }}</strong>
        <el-tag size="small" style="margin-left:8px">{{ roleLabels[auth.user?.role] || auth.user?.role || '' }}</el-tag>
      </span>
      <div style="display:flex;align-items:center;gap:16px">
        <el-badge :value="notifCount" :hidden="notifCount === 0" :max="99">
          <el-button text style="font-size:18px" title="消息通知">🔔</el-button>
        </el-badge>
        <el-button text @click="handleLogout">退出</el-button>
      </div>
    </el-header>
    <el-main>
      <router-view />
    </el-main>
  </el-container>
</el-container>
`,
})
