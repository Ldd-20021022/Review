import { defineComponent, ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import { unreadCount, listNotifications, markRead } from '../../api/notifications.js'
import { initTheme, toggleTheme } from '../../utils/theme.js'
import { get } from '../../api/client.js'

const mainMenus = [
  { path: '/hospital-rating/dashboard', title: '📊 综合仪表盘', roles: ['admin', 'director', 'expert', 'leader', 'dept_head'] },
  { path: '/hospital-rating/form', title: '📋 数据填报', roles: ['admin', 'director', 'expert', 'dept_head'] },
  { path: '/hospital-rating/reports', title: '📄 评级报告', roles: ['admin', 'director', 'expert', 'leader', 'dept_head'] },
  { path: '/hospital-rating/knowledge', title: '📚 知识库', roles: ['admin', 'director', 'expert', 'leader', 'dept_head'] },
  { path: '/hospital-rating/workflow', title: '🔄 质量改进', roles: ['admin', 'director', 'expert', 'dept_head'] },
  { path: '/hospital-rating/profile', title: '👤 个人中心', roles: ['admin', 'director', 'expert', 'leader', 'dept_head'] },
]

const adminMenus = [
  { path: '/hospital-rating/standards', title: '📐 标准库管理', roles: ['admin'] },
  { path: '/admin/departments', title: '🏥 科室管理', roles: ['admin'] },
  { path: '/admin/users', title: '👥 用户管理', roles: ['admin'] },
  { path: '/admin/audit-log', title: '📋 审计日志', roles: ['admin'] },
  { path: '/admin/tenants', title: '🏥 医院管理', roles: ['admin'] },
  { path: '/admin/settings', title: '⚙️ 系统设置', roles: ['admin'] },
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

    const ww = ref(window.innerWidth)
    const isMobile = computed(() => ww.value < 768)
    const collapsed = ref(isMobile.value)
    const notifCount = ref(0)
    const notifs = ref([])
    let timer = null

    function toggleSidebar() { collapsed.value = !collapsed.value }
    function onResize() { ww.value = window.innerWidth; collapsed.value = isMobile.value }
    window.addEventListener('resize', onResize)

    async function fetchNotifs() {
      try { notifCount.value = (await unreadCount()).count || 0 } catch (_) {}
    }

    async function fetchNotifList() {
      try { notifs.value = (await listNotifications()).slice(0, 5) || [] } catch (_) { notifs.value = [] }
    }

    async function handleMarkRead(n) {
      try {
        await markRead(n.id)
        notifCount.value = Math.max(0, notifCount.value - 1)
        notifs.value = notifs.value.map(x => x.id === n.id ? { ...x, is_read: true } : x)
      } catch (_) {}
      if (n.related_id) {
        router.push('/hospital-rating/reports?assessment=' + n.related_id)
      }
    }

    async function markAllRead() {
      for (const n of notifs.value) {
        if (!n.is_read) {
          try { await markRead(n.id) } catch (_) {}
        }
      }
      notifCount.value = 0
      notifs.value = notifs.value.map(x => ({ ...x, is_read: true }))
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

    // ── Global Search ──
    const searchQuery = ref('')
    const searchResults = ref([])
    const searchVisible = ref(false)
    const searching = ref(false)
    let searchTimer = null

    async function doSearch() {
      const q = searchQuery.value.trim()
      if (!q || q.length < 2) { searchResults.value = []; searchVisible.value = false; return }
      searching.value = true
      try {
        const [standards, assessments] = await Promise.all([
          get('/api/hospital-ratings/standards').catch(() => []),
          get('/api/hospital-ratings/my-department').catch(() => []),
        ])
        const results = []
        // Search indicators
        for (const cat of (standards || [])) {
          for (const ind of (cat.indicators || [])) {
            if (ind.name.includes(q) || (ind.code || '').toLowerCase().includes(q.toLowerCase())) {
              results.push({ type: 'indicator', title: ind.name, subtitle: cat.name + ' · ' + (ind.standard_value || ''), id: ind.id, cat: cat.name })
            }
          }
        }
        // Search assessments
        for (const a of (assessments || [])) {
          if ((a.name || '').includes(q) || (a.rating_cycle || '').includes(q)) {
            results.push({ type: 'assessment', title: a.name, subtitle: a.rating_cycle + ' · ' + (a.total_score || 0) + '分', id: a.id })
          }
        }
        searchResults.value = results.slice(0, 20)
        searchVisible.value = true
      } catch (_) { searchResults.value = [] }
      finally { searching.value = false }
    }

    function onSearchInput() {
      clearTimeout(searchTimer)
      searchTimer = setTimeout(doSearch, 300)
    }

    function goResult(r) {
      searchVisible.value = false
      searchQuery.value = ''
      if (r.type === 'assessment') {
        router.push('/hospital-rating/reports?assessment=' + r.id)
      } else {
        // Navigate to standards with search pre-filled
        router.push('/hospital-rating/standards?search=' + encodeURIComponent(r.title))
      }
    }

    function closeSearch() { searchVisible.value = false; searchQuery.value = '' }

    onMounted(() => {
      initTheme()
      fetchNotifs()
      timer = setInterval(fetchNotifs, 15000)
    })
    onUnmounted(() => { if (timer) clearInterval(timer) })

    return {
      route, auth, notifCount, notifs, visibleMenus, visibleAdminMenus, showAdmin,
      collapsed, isMobile, toggleSidebar, toggleTheme,
      handleSelect, handleLogout, roleLabels,
      fetchNotifList, handleMarkRead, markAllRead, searchQuery, searchResults, searchVisible, searching, onSearchInput, goResult, closeSearch,
    }
  },
  template: `
<el-container style="min-height:100vh">
  <!-- Mobile overlay -->
  <div v-if="!collapsed" @click="collapsed = true"
    style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:999"
    :style="{display: isMobile ? 'block' : 'none'}" />

  <el-aside :width="collapsed ? '0px' : '200px'" style="background:#1e293b;transition:width .3s;overflow:hidden;z-index:1000"
    :style="{position: isMobile ? 'fixed' : 'relative', height: isMobile ? '100vh' : 'auto'}">
    <div style="padding:16px 12px;font-weight:700;font-size:15px;color:#fff;border-bottom:1px solid #334155;white-space:nowrap">
      🏥 三甲评级系统
    </div>
    <el-menu :default-active="route.path" background-color="#1e293b" text-color="#94a3b8"
      active-text-color="#60a5fa" @select="handleSelect" :collapse="collapsed">
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
    <el-header style="background:#fff;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 16px;gap:12px">
      <el-button text @click="toggleSidebar" style="font-size:20px">☰</el-button>

      <!-- Global Search -->
      <div style="position:relative;flex:1;max-width:360px;margin:0 12px">
        <el-input v-model="searchQuery" placeholder="🔍 搜索指标、评估..." size="small"
          @input="onSearchInput" @focus="searchQuery.length>=2 && doSearch()" @blur="setTimeout(closeSearch,200)" clearable />
        <div v-if="searchVisible && searchResults.length > 0" @mousedown.prevent
          style="position:absolute;top:100%;left:0;right:0;z-index:2000;background:#fff;border:1px solid #e2e8f0;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.1);max-height:360px;overflow-y:auto;margin-top:4px">
          <div v-for="(r,i) in searchResults" :key="i" @click="goResult(r)"
            style="padding:8px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:13px"
            :style="{background: i===0?'#f8fafc':''}">
            <div>
              <span style="font-weight:600">{{ r.title }}</span>
              <span style="color:#94a3b8;font-size:11px;margin-left:8px">{{ r.subtitle }}</span>
            </div>
            <el-tag size="small" :type="r.type==='assessment'?'warning':'info'">{{ r.type==='assessment'?'评估':'指标' }}</el-tag>
          </div>
        </div>
        <div v-if="searchVisible && searching" @mousedown.prevent
          style="position:absolute;top:100%;left:0;right:0;z-index:2000;background:#fff;border:1px solid #e2e8f0;border-radius:6px;text-align:center;padding:16px;margin-top:4px;color:#94a3b8;font-size:13px">
          搜索中...
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:12px">
      <!-- Notification bell -->
      <el-popover trigger="click" placement="bottom-end" width="320px" @show="fetchNotifList">
        <template #reference>
          <el-badge :value="notifCount" :hidden="notifCount === 0" :max="99">
            <el-button text style="font-size:18px" title="消息通知">🔔</el-button>
          </el-badge>
        </template>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;margin-bottom:4px">
          <span style="font-size:13px;font-weight:600">消息通知</span>
          <el-button v-if="notifCount > 0" text size="small" @click="markAllRead">全部已读</el-button>
        </div>
        <div v-if="notifs.length === 0" style="text-align:center;padding:20px;color:#94a3b8">暂无通知</div>
        <div v-else>
          <div v-for="n in notifs" :key="n.id"
            style="padding:8px 0;border-bottom:1px solid #f1f5f9;cursor:pointer"
            @click="handleMarkRead(n)">
            <div :style="{fontWeight: n.is_read ? 400 : 700, fontSize:'13px'}">{{ n.title }}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:2px">{{ n.content?.substring(0, 50) }}...</div>
          </div>
        </div>
      </el-popover>

        <span style="font-size:13px;color:#64748b">
          <strong>{{ auth.user?.name || '' }}</strong>
          <el-tag size="small" style="margin-left:8px">{{ roleLabels[auth.user?.role] || '' }}</el-tag>
        </span>
        <el-button text @click="toggleTheme" style="font-size:16px" title="切换主题">🌓</el-button>
        <el-button text @click="handleLogout" style="color:#94a3b8">退出</el-button>
      </div>
    </el-header>
    <el-main style="background:#f8fafc">
      <router-view />
    </el-main>
  </el-container>
</el-container>
`,
})
