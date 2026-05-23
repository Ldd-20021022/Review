import { defineComponent, ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from '/src/shim/element-plus.js'
import { useAuthStore } from '../../stores/auth.js'
import { getDashboard, approveRating, rejectRating, getReport } from '../../api/hospital-rating.js'
import { aiInspectionAnalysis, aiAsyncWithPolling } from '../../api/ai.js'
import { get } from '../../api/client.js'
import { donutChart, barChart, radarChart, trendChart } from '../../utils/charts.js'

export default defineComponent({
  name: 'HRDashboard',
  setup() {
    const router = useRouter()
    const auth = useAuthStore()
    const dashboard = ref(null)
    const loading = ref(false)
    const cycle = ref('2025年度')
    const rejectDialog = ref(false)
    const rejectForm = ref({ assessment_id: null, dept_name: '', score: 0, feedback: '', batch: false, ids: [] })
    const rejecting = ref(false)
    const selected = ref(new Set())
    const batchProcessing = ref(false)
    const deptReport = ref(null)
    const lastUpdated = ref('')
    const autoRefresh = ref(true)
    let refreshTimer = null
    const refreshing = ref(false)
    const sortKey = ref('score')
    const sortAsc = ref(true)

    function updateTimestamp() { lastUpdated.value = new Date().toLocaleTimeString('zh-CN') }

    const isManager = computed(() => auth.user?.role === 'admin' || auth.user?.role === 'director')

    const chartHTML = computed(() => {
      if (!dashboard.value) return ''
      const d = dashboard.value
      return donutChart([
        { value: d.approved || 0, color: '#67c23a' },
        { value: d.rejected || 0, color: '#f56c6c' },
        { value: (d.pending || 0) + (d.not_submitted || 0), color: '#e6a23c' },
      ], 100)
    })

    const barChartHTML = computed(() => {
      if (!dashboard.value?.departments?.length) return ''
      const depts = dashboard.value.departments.filter(d => d.score != null).slice(0, 10)
      if (!depts.length) return ''
      const colors = ['#3b82f6', '#67c23a', '#e6a23c', '#f56c6c', '#8b5cf6', '#06b6d4']
      return barChart(
        depts.map((d, i) => ({ label: d.name.slice(0, 4), value: d.score, color: colors[i % colors.length] })),
        360, 220
      )
    })

    const radarChartHTML = computed(() => {
      const catStats = dashboard.value?.category_stats
      if (!catStats || catStats.length < 3) return ''
      const axes = catStats.slice(0, 8).map(c => c.name.slice(0, 4))
      const values = catStats.slice(0, 8).map(c => c.rate)
      return radarChart(axes, values, 260)
    })

    const trendChartHTML = computed(() => {
      if (!dashboard.value?.departments?.length) return ''
      const deptsWithScore = dashboard.value.departments.filter(d => d.score != null && d.rating_cycle)
      if (deptsWithScore.length < 2) return ''
      // Group by cycle and compute average score per cycle
      const cycleMap = {}
      for (const d of deptsWithScore) {
        const c = d.rating_cycle || '未知'
        if (!cycleMap[c]) cycleMap[c] = { total: 0, count: 0 }
        cycleMap[c].total += d.score
        cycleMap[c].count += 1
      }
      const pts = Object.entries(cycleMap).map(([label, data]) => ({
        label, value: Math.round(data.total / data.count)
      }))
      pts.sort((a, b) => (a.label || '').localeCompare(b.label || ''))
      return pts.length >= 2 ? trendChart(pts, 300, 140) : ''
    })

    const sortedDepts = computed(() => {
      let depts = (dashboard.value?.departments || []).slice()
      // Filter by selected cycle
      if (cycle.value) {
        depts = depts.filter(d => !d.rating_cycle || d.rating_cycle === cycle.value)
      }
      depts.sort((a, b) => {
        const va = a[sortKey.value] ?? (sortKey.value === 'score' ? -1 : '')
        const vb = b[sortKey.value] ?? (sortKey.value === 'score' ? -1 : '')
        if (va < vb) return sortAsc.value ? -1 : 1
        if (va > vb) return sortAsc.value ? 1 : -1
        return 0
      })
      return depts
    })

    const filteredStats = computed(() => {
      const depts = sortedDepts.value
      const scores = depts.filter(d => d.score != null).map(d => d.score)
      return {
        avgScore: scores.length ? (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1) : '-',
        total: depts.length,
        approved: depts.filter(d => d.status === 'approved').length,
        rejected: depts.filter(d => d.status === 'rejected').length,
        pending: depts.filter(d => d.status === 'submitted' || d.status === 'revising').length,
        notSubmitted: depts.filter(d => d.status === 'not_submitted' || d.status === 'draft').length,
      }
    })

    function toggleSort(key) {
      if (sortKey.value === key) sortAsc.value = !sortAsc.value
      else { sortKey.value = key; sortAsc.value = key === 'status' }
    }

    async function fetch(showSpinner = true) {
      if (showSpinner) loading.value = true; else refreshing.value = true
      try {
        dashboard.value = await getDashboard()
        if (!isManager.value && dashboard.value?.departments?.length > 0) {
          const aid = dashboard.value.departments[0].assessment_id
          if (aid) { try { deptReport.value = await getReport(aid) } catch (_) { deptReport.value = null } }
        }
        updateTimestamp()
      } finally { loading.value = false; refreshing.value = false }
    }

    function toggleAutoRefresh() {
      autoRefresh.value = !autoRefresh.value
      if (autoRefresh.value) startAutoRefresh()
      else stopAutoRefresh()
    }

    function startAutoRefresh() {
      stopAutoRefresh()
      if (autoRefresh.value) refreshTimer = setInterval(() => fetch(false), 30000)
    }

    function stopAutoRefresh() { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null } }

    function goReport(id) { if (id) router.push(`/hospital-rating/reports?assessment=${id}`) }

    function toggleSelect(aid) {
      const s = new Set(selected.value); s.has(aid) ? s.delete(aid) : s.add(aid); selected.value = s
    }
    function selectAllSubmitted() {
      const ids = (dashboard.value?.departments || []).filter(d => d.status === 'submitted' && d.assessment_id).map(d => d.assessment_id)
      selected.value = new Set(ids)
    }
    function clearSelection() { selected.value = new Set() }

    function openReject(row) {
      rejectForm.value = { assessment_id: row.assessment_id, dept_name: row.name, score: row.score || 0, feedback: '', batch: false, ids: [] }
      rejectDialog.value = true
    }
    function openBatchReject() {
      const ids = [...selected.value]
      if (ids.length === 0) { ElMessage.warning('请选择科室'); return }
      const names = (dashboard.value?.departments || []).filter(d => ids.includes(d.assessment_id)).map(d => d.name).join('、')
      rejectForm.value = { assessment_id: ids[0], dept_name: `${ids.length}个科室(${names})`, score: 0, feedback: '', batch: true, ids }
      rejectDialog.value = true
    }

    async function handleReject() {
      if (!rejectForm.value.feedback.trim()) { ElMessage.warning('请填写退回意见'); return }
      rejecting.value = true
      const ids = rejectForm.value.batch ? rejectForm.value.ids : [rejectForm.value.assessment_id]
      try { let ok = 0; for (const id of ids) { try { await rejectRating(id, rejectForm.value.feedback); ok++ } catch (_) {} }
        ElMessage.success(`已退回${ok}/${ids.length}个`); rejectDialog.value = false; clearSelection(); await fetch()
      } catch (e) { ElMessage.error('失败: ' + e.message) } finally { rejecting.value = false }
    }

    async function handleApprove(row) {
      try {
        await ElMessageBox.confirm(`确认通过【${row.name}】？`, '通过', { type: 'success' })
        await approveRating(row.assessment_id); ElMessage.success('已通过'); await fetch()
      } catch (e) {
        if (e !== 'cancel' && e?.message !== 'cancel') ElMessage.error('失败: ' + (e?.message || ''))
      }
    }

    async function batchApprove() {
      const ids = [...selected.value]
      if (ids.length === 0) { ElMessage.warning('请选择科室'); return }
      try { await ElMessageBox.confirm(`批量通过${ids.length}个科室？`, '批量通过', { type: 'success' }) }
      catch (_) { return }
      batchProcessing.value = true; let ok = 0
      for (const id of ids) { try { await approveRating(id); ok++ } catch (_) {} }
      ElMessage.success(`已通过${ok}/${ids.length}`); clearSelection(); batchProcessing.value = false; await fetch()
    }

    // ── Recent activity ──
    const recentLogs = ref([])
    const logsLoading = ref(false)

    async function fetchRecentLogs() {
      if (!isManager.value) return
      logsLoading.value = true
      try {
        const res = await get('/api/audit-logs', { size: 8 })
        recentLogs.value = res.items || []
      } catch (_) { recentLogs.value = [] }
      finally { logsLoading.value = false }
    }

    const actionLabelMap = {
      submit: '📤 提交', draft: '💾 草稿', import: '📥 导入',
      approve: '✅ 通过', reject: '❌ 退回', resubmit: '🔄 重新提交',
      edit: '✏️ 修改', create: '➕ 创建', delete: '🗑 删除',
    }

    function fmtLogTime(ts) {
      if (!ts) return ''
      const d = new Date(ts)
      const now = new Date()
      const diff = now - d
      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
      return d.toLocaleDateString('zh-CN')
    }

    // ── AI diagnostics ──
    const aiDiagnosing = ref(false)
    const aiDiagnosis = ref('')

    const aiDiagnosisProgress = ref('')

    async function runAIDiagnosis() {
      aiDiagnosing.value = true
      aiDiagnosis.value = ''
      aiDiagnosisProgress.value = '正在提交AI诊断任务...'
      try {
        const { result, error, timedOut } = await aiAsyncWithPolling('inspection', { count: 20 }, {
          onProgress: ({ status, elapsed }) => {
            aiDiagnosisProgress.value = status === 'running' ? 'AI 正在分析全院数据... (已等待 ' + elapsed + '秒)' : ''
          }
        })
        if (error) { ElMessage.error(error); return }
        if (result) {
          let text = result.ai_analysis || 'AI 暂未返回分析结果'
          if (result.items) {
            const issues = result.items.filter(i => !i.is_compliant)
            text += '\n\n📊 抽检统计：共' + result.total + '项，达标' + result.compliant + '项，通过率' + result.pass_rate + '%'
            if (issues.length > 0) {
              text += '\n⚠️ 发现问题：' + issues.map(i => i.indicator_name).join('、')
            }
          }
          aiDiagnosis.value = text
        }
      } catch (e) {
        ElMessage.error('AI 诊断失败: ' + (e.message || '服务暂不可用'))
      } finally { aiDiagnosing.value = false; aiDiagnosisProgress.value = '' }
    }

    function exportCSV() {
      const depts = dashboard.value?.departments || []
      const rows = [['科室','周期','总分','状态','未达标']]
      for (const d of depts) rows.push([d.name, d.rating_cycle||'-', d.score??'-', statusMap[d.status]||d.status, d.non_compliant_count||0])
      const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n')
      const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'})
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download='全院评级.csv'; a.click()
      URL.revokeObjectURL(url)
    }

    const statusMap = { approved: '✅已通过', rejected: '❌已退回', submitted: '📝待审核', revising: '🔄整改中', draft: '📋草稿', not_submitted: '📋未提交' }

    onMounted(() => { fetch(); fetchRecentLogs(); startAutoRefresh(); updateTimestamp() })
    onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })

    return {
      dashboard, loading, cycle, rejectDialog, rejectForm, rejecting, isManager, selected, batchProcessing, deptReport,
      chartHTML, barChartHTML, radarChartHTML, trendChartHTML, sortedDepts, filteredStats, sortKey, sortAsc,
      goReport, toggleSelect, selectAllSubmitted, clearSelection, openReject, openBatchReject, handleReject, handleApprove,
      batchApprove, exportCSV, toggleSort, statusMap,
      aiDiagnosing, aiDiagnosis, aiDiagnosisProgress, runAIDiagnosis, router,
      recentLogs, logsLoading, fetchRecentLogs, actionLabelMap, fmtLogTime,
      lastUpdated, autoRefresh, refreshing, toggleAutoRefresh,
    }
  },
  template: `
<div v-loading="loading">
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h2 style="margin:0">{{ isManager ? '🏥 全院三甲评审仪表盘' : '📊 本科室评审概览' }}</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <el-select v-model="cycle" size="small" style="width:120px">
        <el-option v-for="y in ['2024年度','2025年度','2026年度']" :key="y" :label="y" :value="y" />
      </el-select>
      <el-button size="small" @click="fetch()" :loading="refreshing">🔄 刷新</el-button>
      <el-button size="small" :type="autoRefresh ? 'success' : 'info'" @click="toggleAutoRefresh" style="font-size:11px">
        {{ autoRefresh ? '⏱ 自动' : '⏸ 手动' }}
      </el-button>
      <span v-if="lastUpdated" style="font-size:11px;color:#94a3b8">更新于 {{ lastUpdated }}</span>
      <el-button v-if="isManager" size="small" @click="exportCSV">📥 导出</el-button>
    </div>
  </div>

  <!-- Quick Actions -->
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <el-button size="small" @click="router.push('/hospital-rating/form')">📋 填报数据</el-button>
    <el-button size="small" @click="router.push('/hospital-rating/reports')">📄 查看报告</el-button>
    <el-button v-if="isManager" size="small" @click="router.push('/hospital-rating/workflow')">🔄 质量改进</el-button>
    <el-button v-if="isManager" size="small" @click="router.push('/hospital-rating/knowledge')">📚 AI 知识库</el-button>
    <el-button v-if="isManager" size="small" type="warning" @click="runAIDiagnosis" :loading="aiDiagnosing">🤖 AI 诊断</el-button>
  </div>

  <!-- Stat Cards -->
  <el-row :gutter="12" style="margin-bottom:12px">
    <el-col :span="4" v-if="isManager">
      <el-card shadow="never" style="text-align:center;padding:4px">
        <div v-html="chartHTML"></div>
        <div style="font-size:11px;color:#94a3b8">达标分布</div>
      </el-card>
    </el-col>
    <el-col :span="isManager ? 5 : 6">
      <el-card shadow="never" style="text-align:center;border-left:3px solid #3b82f6">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">{{ isManager ? '全院均分' : '科室得分' }}</div>
        <div style="font-size:28px;font-weight:700;color:#3b82f6">{{ isManager ? filteredStats.avgScore : (dashboard?.average_score ?? '-') }}</div>
      </el-card>
    </el-col>
    <el-col :span="isManager ? 5 : 6">
      <el-card shadow="never" style="text-align:center;border-left:3px solid #67c23a">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">✅ 已通过</div>
        <div style="font-size:28px;font-weight:700;color:#67c23a">{{ isManager ? filteredStats.approved : (dashboard?.approved ?? 0) }}<span style="font-size:14px">个</span></div>
      </el-card>
    </el-col>
    <el-col :span="isManager ? 5 : 6">
      <el-card shadow="never" style="text-align:center;border-left:3px solid #f56c6c">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">❌ 已退回</div>
        <div style="font-size:28px;font-weight:700;color:#f56c6c">{{ isManager ? filteredStats.rejected : (dashboard?.rejected ?? 0) }}<span style="font-size:14px">个</span></div>
      </el-card>
    </el-col>
    <el-col :span="isManager ? 5 : 6">
      <el-card shadow="never" style="text-align:center;border-left:3px solid #e6a23c">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">📝 待审核/提交</div>
        <div style="font-size:28px;font-weight:700;color:#e6a23c">{{ isManager ? (filteredStats.pending + filteredStats.notSubmitted) : ((dashboard?.pending ?? 0) + (dashboard?.not_submitted ?? 0)) }}<span style="font-size:14px">个</span></div>
      </el-card>
    </el-col>
  </el-row>

  <!-- Urgent Alert Row (admin only) -->
  <el-card v-if="isManager && dashboard?.urgent?.length > 0" shadow="never"
    style="margin-bottom:12px;background:#fef2f2;border:1px solid #fecaca">
    <template #header><span style="font-weight:700;color:#c62828">🔴 急需关注</span></template>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <div v-for="d in dashboard.urgent" :key="d.id"
        @click="d.assessment_id ? goReport(d.assessment_id) : null"
        :style="{padding:'10px 14px',borderRadius:'6px',cursor:d.assessment_id?'pointer':'default',
          background: d.status==='rejected'?'#fee2e2':'#fef3c7',flex:'1 1 160px',maxWidth:'220px'}">
        <div style="font-weight:600;font-size:13px">{{ d.name }}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px">
          <span v-if="d.status==='rejected'" style="color:#c62828">❌ 退回 {{ d.score }}分 {{ d.non_compliant_count }}项不达标</span>
          <span v-else style="color:#e6a23c">📋 {{ statusMap[d.status] }}</span>
        </div>
      </div>
    </div>
  </el-card>

  <!-- Charts Row (admin only) -->
  <el-row v-if="isManager" :gutter="12" style="margin-bottom:12px">
    <el-col :span="8">
      <el-card shadow="never">
        <template #header><span style="font-weight:600;font-size:13px">📊 科室得分对比</span></template>
        <div v-if="barChartHTML" v-html="barChartHTML" style="display:flex;justify-content:center" />
        <div v-else style="text-align:center;padding:30px;color:#94a3b8;font-size:13px">暂无数据</div>
      </el-card>
    </el-col>
    <el-col :span="8">
      <el-card shadow="never">
        <template #header><span style="font-weight:600;font-size:13px">🎯 分类达标雷达</span></template>
        <div v-if="radarChartHTML" v-html="radarChartHTML" style="display:flex;justify-content:center" />
        <div v-else style="text-align:center;padding:30px;color:#94a3b8;font-size:13px">暂无分类数据</div>
      </el-card>
    </el-col>
    <el-col :span="8">
      <el-card shadow="never">
        <template #header><span style="font-weight:600;font-size:13px">📈 趋势变化</span></template>
        <div v-if="trendChartHTML" v-html="trendChartHTML" style="display:flex;justify-content:center" />
        <div v-else style="text-align:center;padding:30px;color:#94a3b8;font-size:13px">
          <p style="font-size:32px;margin:0">📈</p>
          <p>多周期数据将自动生成趋势图</p>
        </div>
      </el-card>
    </el-col>
  </el-row>

  <!-- Department Table (admin only) -->
  <el-card v-if="isManager" shadow="never" style="margin-bottom:12px">
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span>
          <span style="font-weight:700">科室评审状态</span>
          <span style="color:#94a3b8;font-size:12px;margin-left:8px">共{{ dashboard?.total_departments || 0 }}个</span>
        </span>
        <div style="display:flex;gap:6px">
          <template v-if="selected.size > 0">
            <span style="font-size:12px;color:#64748b">已选{{selected.size}}个</span>
            <el-button size="small" type="success" @click="batchApprove" :loading="batchProcessing">✅批量通过</el-button>
            <el-button size="small" type="danger" @click="openBatchReject">❌批量退回</el-button>
            <el-button size="small" @click="clearSelection">取消</el-button>
          </template>
          <el-button v-else size="small" @click="selectAllSubmitted">全选待审核</el-button>
        </div>
      </div>
    </template>
    <el-table :data="sortedDepts" stripe size="small">
      <el-table-column width="36" align="center">
        <template #default="{row}">
          <el-checkbox v-if="row.status==='submitted'&&row.assessment_id"
            :model-value="selected.has(row.assessment_id)" @change="toggleSelect(row.assessment_id)" />
        </template>
      </el-table-column>
      <el-table-column label="科室" width="100">
        <template #default="{row}">{{ row.name }}</template>
      </el-table-column>
      <el-table-column label="周期" width="90">
        <template #default="{row}">{{ row.rating_cycle || '-' }}</template>
      </el-table-column>
      <el-table-column label="总分" width="180" sortable @click="toggleSort('score')">
        <template #default="{row}">
          <div v-if="row.score!=null" style="display:flex;align-items:center;gap:6px">
            <el-progress :percentage="row.score" :color="row.score>=60?'#67c23a':'#f56c6c'" :stroke-width="6" style="flex:1" />
            <span :style="{fontWeight:'700',color:row.score>=60?'#67c23a':'#f56c6c',fontSize:'13px'}">{{ row.score }}</span>
          </div>
          <span v-else style="color:#c0c4cc">-</span>
        </template>
      </el-table-column>
      <el-table-column label="达标" width="80" align="center">
        <template #default="{row}">
          <span v-if="row.total_items>0" style="font-size:12px">
            <span style="color:#67c23a">{{ row.total_items - (row.non_compliant_count||0) }}</span>
            <span style="color:#c0c4cc">/{{ row.total_items }}</span>
          </span>
          <span v-else style="color:#c0c4cc">-</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{row}">
          <el-tag :type="row.status==='approved'?'success':row.status==='rejected'?'danger':row.status==='submitted'?'warning':'info'" size="small">
            {{ statusMap[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" align="center">
        <template #default="{row}">
          <div v-if="row.assessment_id" style="display:flex;gap:4px;justify-content:center">
            <el-button size="small" @click="goReport(row.assessment_id)">查看</el-button>
            <el-button v-if="row.status==='submitted'" size="small" type="success" @click="handleApprove(row)">通过</el-button>
            <el-button v-if="row.status==='submitted'" size="small" type="danger" @click="openReject(row)">退回</el-button>
          </div>
          <span v-else style="color:#c0c4cc;font-size:12px">-</span>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <!-- Dept Head: Gap Analysis Card -->
  <el-card v-if="!isManager && dashboard?.departments?.length > 0" shadow="never" style="margin-bottom:12px">
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700">📊 本科室概况</span>
        <el-tag :type="dashboard.departments[0].status==='rejected'?'danger':dashboard.departments[0].status==='approved'?'success':'warning'" size="small">
          {{ statusMap[dashboard.departments[0].status] }}
        </el-tag>
      </div>
    </template>
    <el-row :gutter="12" style="margin-bottom:8px">
      <el-col :span="8"><div style="text-align:center;padding:8px;background:#f8fafc;border-radius:6px"><div style="font-size:22px;font-weight:700" :style="{color:(dashboard.departments[0].score||0)>=60?'#67c23a':'#f56c6c'}">{{ dashboard.departments[0].score ?? '-' }}</div><div style="font-size:11px;color:#94a3b8">总分</div></div></el-col>
      <el-col :span="8"><div style="text-align:center;padding:8px;background:#f8fafc;border-radius:6px"><div style="font-size:22px;font-weight:700;color:#f56c6c">{{ dashboard.departments[0].non_compliant_count || 0 }}</div><div style="font-size:11px;color:#94a3b8">未达标</div></div></el-col>
      <el-col :span="8"><div style="text-align:center;padding:8px;background:#f8fafc;border-radius:6px"><div style="font-size:22px;font-weight:700;color:#3b82f6">{{ dashboard.departments[0].total_items || 0 }}</div><div style="font-size:11px;color:#94a3b8">总指标</div></div></el-col>
    </el-row>
    <div v-if="deptReport?.items" style="margin-top:8px">
      <div v-for="it in deptReport.items.filter(i=>!i.is_compliant)" :key="it.id"
        style="padding:5px 8px;margin-bottom:3px;background:#fff5f5;border-radius:4px;font-size:12px;display:flex;justify-content:space-between">
        <span>{{ it.category_name }} · {{ it.name }}</span>
        <span style="color:#c62828;font-weight:600">{{ it.actual_value || '-' }} / {{ it.standard_value }}{{ it.unit || '' }}</span>
      </div>
      <div v-if="deptReport.items.filter(i=>!i.is_compliant).length===0" style="color:#67c23a;font-size:13px;text-align:center;padding:8px">✅ 全部达标</div>
    </div>
    <el-button v-if="dashboard.departments[0].assessment_id" size="small" type="primary" style="margin-top:8px" @click="goReport(dashboard.departments[0].assessment_id)">查看完整报告 →</el-button>
  </el-card>

  <!-- Category Compliance (admin only) -->
  <el-card v-if="isManager && dashboard?.category_stats?.length > 0" shadow="never">
    <template #header><span style="font-weight:700">📊 分类达标一览</span></template>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <div v-for="cat in dashboard.category_stats" :key="cat.name"
        style="flex:1;min-width:180px;padding:10px 12px;background:#f8fafc;border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:13px;font-weight:600">{{ cat.name }}</span>
          <span style="font-size:12px" :style="{color: cat.rate>=80?'#67c23a':cat.rate>=60?'#e6a23c':'#f56c6c'}">{{ cat.rate }}%</span>
        </div>
        <el-progress :percentage="cat.rate" :color="cat.rate>=80?'#67c23a':cat.rate>=60?'#e6a23c':'#f56c6c'" :stroke-width="6" />
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">{{ cat.compliant }}/{{ cat.total }} 项达标</div>
      </div>
    </div>
  </el-card>

  <!-- Recent Activity (admin only) -->
  <el-card v-if="isManager" shadow="never" style="margin-top:12px">
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700">📋 近期动态</span>
        <el-button size="small" @click="fetchRecentLogs" :loading="logsLoading">🔄 刷新</el-button>
      </div>
    </template>
    <div v-if="recentLogs.length === 0" style="text-align:center;padding:20px;color:#94a3b8;font-size:13px">
      暂无操作记录
    </div>
    <div v-else style="display:flex;flex-direction:column;gap:4px">
      <div v-for="log in recentLogs.slice(0, 8)" :key="log.id"
        style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:4px;font-size:12px"
        :style="{background: log.action === 'reject' ? '#fff5f5' : log.action === 'approve' ? '#f0fdf4' : '#f8fafc'}">
        <span style="width:70px">{{ actionLabelMap[log.action] || log.action }}</span>
        <span style="color:#64748b;flex:1">{{ log.detail || (log.target_type + '#' + log.target_id) }}</span>
        <span style="color:#94a3b8;font-size:11px;white-space:nowrap">{{ fmtLogTime(log.created_at) }}</span>
      </div>
    </div>
  </el-card>

  <!-- AI Diagnostic Panel (admin only) -->
  <el-card v-if="isManager" shadow="never" style="margin-top:12px;border-left:4px solid #3b82f6">
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:700">🤖 AI 全院诊断</span>
        <el-button size="small" type="warning" @click="runAIDiagnosis" :loading="aiDiagnosing">
          🔍 开始AI诊断
        </el-button>
      </div>
    </template>
    <div v-if="aiDiagnosing" style="text-align:center;padding:30px">
      <span style="font-size:28px">⏳</span>
      <p style="color:#94a3b8;font-size:13px;margin-top:8px">{{ aiDiagnosisProgress || 'AI 正在分析全院评审数据，识别薄弱环节...' }}</p>
    </div>
    <div v-if="aiDiagnosis" style="line-height:1.9;color:#334155;font-size:14px;white-space:pre-wrap">{{ aiDiagnosis }}</div>
    <div v-if="!aiDiagnosis && !aiDiagnosing" style="text-align:center;padding:30px;color:#94a3b8">
      <p style="font-size:36px;margin:0">🤖</p>
      <p style="margin-top:8px">点击"开始AI诊断"，DeepSeek 将随机抽检全院指标并分析薄弱环节</p>
    </div>
  </el-card>

  <!-- Reject Dialog -->
  <el-dialog v-if="isManager" v-model="rejectDialog" :title="rejectForm.batch?'❌ 批量退回':'❌ 退回科室'" width="500px">
    <div style="margin-bottom:12px">
      <p><strong>科室：</strong>{{ rejectForm.dept_name }}</p>
      <p v-if="!rejectForm.batch"><strong>得分：</strong><span :style="{color:rejectForm.score>=60?'#e6a23c':'#f56c6c',fontWeight:'700'}">{{ rejectForm.score }}分</span></p>
    </div>
    <el-form label-width="80px">
      <el-form-item label="退回意见" required>
        <el-input v-model="rejectForm.feedback" type="textarea" :rows="3" placeholder="填写整改意见..." />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="rejectDialog=false">取消</el-button>
      <el-button type="danger" @click="handleReject" :loading="rejecting">确认退回</el-button>
    </template>
  </el-dialog>
</div>
`,
})
