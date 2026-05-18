import { defineComponent, ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import { unreadCount, listNotifications, markRead } from '../../api/notifications.js'

const mainMenus = [
  { path: '/hospital-rating/dashboard', title: '📊 综合仪表盘', roles: ['admin', 'director', 'expert', 'leader', 'dept_head'] },
  { path: '/hospital-rating/form', title: '📋 数据填报', roles: ['admin', 'director', 'expert', 'dept_head'] },
  { path: '/hospital-rating/reports', title: '📄 评级报告', roles: ['admin', 'director', 'expert', 'leader', 'dept_head'] },
]

const adminMenus = [
  { path: '/hospital-rating/standards', title: '📐 标准库管理', roles: ['admin'] },
  { path: '/admin/departments', title: '🏥 科室管理', roles: ['admin'] },
  { path: '/admin/users', title: '👥 用户管理', roles: ['admin'] },
]

const roleLabels = {
  admin: '管理员', director: '院长', expert: '评级专家',
  dept_head: '科室负责人', leader: '院领导',
}

export default defineComponent({
  name: 'HRLayout',
  setup() {
    const router = useRouter()
    const route = useRoute()
    const auth = useAuthStore()

    auth.fetchMe()

    const notifCount = ref(0)
    const notifs = ref([])
    let timer = null

    async function fetchNotifs() {
      try { notifCount.value = (await unreadCount()).count || 0 } catch (_) {}
    }

    async function fetchNotifList() {
      try { notifs.value = (await listNotifications()).slice(0, 5) || [] } catch (_) { notifs.value = [] }
    }

    async function handleMarkRead(nid) {
      try {
        await markRead(nid)
        notifCount.value = Math.max(0, notifCount.value - 1)
        notifs.value = notifs.value.map(n => n.id === nid ? { ...n, is_read: true } : n)
      } catch (_) {}
    }

    function viewAll() {
      router.push('/hospital-rating/reports')
    }

    const visibleMenus = computed(() =>
      mainMenus.filter(m => m.roles.includes(auth.user?.role))
    )
    const visibleAdminMenus = computed(() =>
      adminMenus.filter(m => m.roles.includes(auth.user?.role))
    )
    const showAdmin = computed(() => visibleAdminMenus.value.length > 0)

    function handleSelect(path) { if (path) router.push(path) }
    function handleLogout() { auth.logout(); router.push('/login') }

    onMounted(() => {
      fetchNotifs()
      timer = setInterval(fetchNotifs, 30000)
    })
    onUnmounted(() => { if (timer) clearInterval(timer) })

    return {
      route, auth, notifCount, notifs, visibleMenus, visibleAdminMenus, showAdmin,
      handleSelect, handleLogout, roleLabels,
      fetchNotifList, handleMarkRead, viewAll,
    }
  },
  template: `
<el-container style="min-height:100vh">
  <el-aside width="200px" style="background:#1e293b">
    <div style="padding:16px 12px;font-weight:700;font-size:15px;color:#fff;border-bottom:1px solid #334155">
      🏥 三甲评级系统
    </div>
    <el-menu :default-active="route.path" background-color="#1e293b" text-color="#94a3b8"
      active-text-color="#60a5fa" @select="handleSelect">
      <el-menu-item v-for="m in visibleMenus" :key="m.path" :index="m.path">
        <span>{{ m.title }}</span>
      </el-menu-item>
      <el-sub-menu v-if="showAdmin" index="admin">
        <template #title>⚙️ 系统管理</template>
        <el-menu-item v-for="m in visibleAdminMenus" :key="m.path" :index="m.path">
          {{ m.title }}
        </el-menu-item>
      </el-sub-menu>
    </el-menu>
  </el-aside>
  <el-container>
    <el-header style="background:#fff;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:flex-end;height:52px;padding:0 24px;gap:16px">
      <!-- Notification bell -->
      <el-popover trigger="click" placement="bottom-end" width="320px" @show="fetchNotifList">
        <template #reference>
          <el-badge :value="notifCount" :hidden="notifCount === 0" :max="99">
            <el-button text style="font-size:18px" title="消息通知">🔔</el-button>
          </el-badge>
        </template>
        <div v-if="notifs.length === 0" style="text-align:center;padding:20px;color:#94a3b8">暂无通知</div>
        <div v-else>
          <div v-for="n in notifs" :key="n.id"
            style="padding:8px 0;border-bottom:1px solid #f1f5f9;cursor:pointer"
            @click="handleMarkRead(n.id)">
            <div :style="{fontWeight: n.is_read ? 400 : 700, fontSize:'13px'}">{{ n.title }}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:2px">{{ n.content?.substring(0, 50) }}...</div>
          </div>
          <div @click="viewAll" style="text-align:center;padding:8px;color:#3b82f6;font-size:13px;cursor:pointer">
            查看全部 →
          </div>
        </div>
      </el-popover>

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
