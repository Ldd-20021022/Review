import { defineComponent, ref, onMounted } from 'vue'
import { get } from '../../api/client.js'

const actionLabels = {
  submit: '📤 提交', draft: '💾 保存草稿', import: '📥 导入',
  approve: '✅ 通过', reject: '❌ 退回', resubmit: '🔄 重新提交',
  edit: '✏️ 修改', login: '🔑 登录', create: '➕ 创建', delete: '🗑 删除',
}
const actionColors = {
  submit: 'warning', draft: 'info', import: 'info',
  approve: 'success', reject: 'danger', resubmit: 'warning',
  edit: 'info', login: '', create: 'success', delete: 'danger',
}

export default defineComponent({
  name: 'AuditLogViewer',
  setup() {
    const logs = ref([])
    const loading = ref(false)
    const total = ref(0)
    const page = ref(1)
    const size = ref(50)
    const filterAction = ref('')

    async function fetch() {
      loading.value = true
      try {
        const params = { page: page.value, size: size.value }
        if (filterAction.value) params.action = filterAction.value
        const res = await get('/api/audit-logs', params)
        logs.value = res.items || []
        total.value = res.total || 0
      } catch (e) {
        logs.value = []
      } finally { loading.value = false }
    }

    function formatTime(ts) {
      if (!ts) return '-'
      const d = new Date(ts)
      const pad = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    }

    function onPageChange(p) { page.value = p; fetch() }

    const actionOptions = Object.entries(actionLabels).map(([k, v]) => ({ value: k, label: v }))

    onMounted(fetch)

    return { logs, loading, total, page, size, filterAction, fetch, formatTime, onPageChange, actionLabels, actionColors, actionOptions }
  },
  template: `
<div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2>📋 审计日志</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <el-select v-model="filterAction" placeholder="操作类型" size="small" style="width:140px" clearable @change="page=1;fetch()">
        <el-option v-for="o in actionOptions" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <el-button size="small" @click="page=1;fetch()">🔄 刷新</el-button>
    </div>
  </div>

  <el-card v-loading="loading">
    <div v-if="logs.length === 0" style="text-align:center;padding:40px;color:#909399">暂无日志记录</div>
    <el-table v-else :data="logs" stripe size="small">
      <el-table-column label="时间" width="170">
        <template #default="{ row }"><span style="font-size:12px;color:#64748b">{{ formatTime(row.created_at) }}</span></template>
      </el-table-column>
      <el-table-column label="用户" width="80" align="center">
        <template #default="{ row }">{{ row.user_id }}</template>
      </el-table-column>
      <el-table-column label="操作" width="130" align="center">
        <template #default="{ row }">
          <el-tag :type="actionColors[row.action] || 'info'" size="small">
            {{ actionLabels[row.action] || row.action }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="对象" width="120" align="center">
        <template #default="{ row }">
          <span style="font-size:12px">{{ row.target_type }}#{{ row.target_id }}</span>
        </template>
      </el-table-column>
      <el-table-column label="详情" min-width="200">
        <template #default="{ row }">
          <span style="font-size:12px;color:#475569">{{ row.detail || '-' }}</span>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="total > size" style="margin-top:16px;text-align:center">
      <el-pagination
        :current-page="page" :page-size="size" :total="total"
        layout="prev, pager, next, total"
        @current-change="onPageChange" background small />
    </div>
  </el-card>
</div>
`,
})
