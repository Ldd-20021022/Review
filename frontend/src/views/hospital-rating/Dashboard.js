import { defineComponent, ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from '/src/shim/element-plus.js'
import { useAuthStore } from '../../stores/auth.js'
import { getDashboard, approveRating, rejectRating, getReport } from '../../api/hospital-rating.js'
import { donutChart } from '../../utils/charts.js'

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
    const sortKey = ref('score')
    const sortAsc = ref(false)

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

    const sortedDepts = computed(() => {
      const depts = (dashboard.value?.departments || []).slice()
      depts.sort((a, b) => {
        const va = a[sortKey.value] ?? (sortKey.value === 'score' ? -1 : '')
        const vb = b[sortKey.value] ?? (sortKey.value === 'score' ? -1 : '')
        if (va < vb) return sortAsc.value ? -1 : 1
        if (va > vb) return sortAsc.value ? 1 : -1
        return 0
      })
      return depts
    })

    function toggleSort(key) {
      if (sortKey.value === key) sortAsc.value = !sortAsc.value
      else { sortKey.value = key; sortAsc.value = key === 'status' }
    }

    async function fetch() {
      loading.value = true
      try {
        dashboard.value = await getDashboard()
        if (!isManager.value && dashboard.value?.departments?.length > 0) {
          const aid = dashboard.value.departments[0].assessment_id
          if (aid) { try { deptReport.value = await getReport(aid) } catch (_) { deptReport.value = null } }
        }
      } finally { loading.value = false }
    }

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
      await ElMessageBox.confirm(`确认通过【${row.name}】？`, '通过', { type: 'success' })
      try { await approveRating(row.assessment_id); ElMessage.success('已通过'); await fetch() } catch (e) { ElMessage.error('失败: ' + e.message) }
    }

    async function batchApprove() {
      const ids = [...selected.value]
      if (ids.length === 0) { ElMessage.warning('请选择科室'); return }
      await ElMessageBox.confirm(`批量通过${ids.length}个科室？`, '批量通过', { type: 'success' })
      batchProcessing.value = true; let ok = 0
      for (const id of ids) { try { await approveRating(id); ok++ } catch (_) {} }
      ElMessage.success(`已通过${ok}/${ids.length}`); clearSelection(); batchProcessing.value = false; await fetch()
    }

    function exportCSV() {
      const depts = dashboard.value?.departments || []
      const rows = [['科室','周期','总分','状态','未达标']]
      for (const d of depts) rows.push([d.name, d.rating_cycle||'-', d.score??'-', statusMap[d.status]||d.status, d.non_compliant_count||0])
      const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n')
      const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'})
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='全院评级.csv'; a.click()
    }

    const statusMap = { approved: '✅已通过', rejected: '❌已退回', submitted: '📝待审核', revising: '🔄整改中', draft: '📋草稿', not_submitted: '📋未提交' }

    onMounted(fetch)

    return {
      dashboard, loading, cycle, rejectDialog, rejectForm, rejecting, isManager, selected, batchProcessing, deptReport,
      chartHTML, sortedDepts, sortKey, sortAsc,
      goReport, toggleSelect, selectAllSubmitted, clearSelection, openReject, openBatchReject, handleReject, handleApprove,
      batchApprove, exportCSV, toggleSort, statusMap,
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
      <el-button size="small" @click="fetch">🔄 刷新</el-button>
      <el-button v-if="isManager" size="small" @click="exportCSV">📥 导出</el-button>
    </div>
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
        <div style="font-size:28px;font-weight:700;color:#3b82f6">{{ dashboard?.average_score ?? '-' }}</div>
      </el-card>
    </el-col>
    <el-col :span="isManager ? 5 : 6">
      <el-card shadow="never" style="text-align:center;border-left:3px solid #67c23a">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">✅ 已达标</div>
        <div style="font-size:28px;font-weight:700;color:#67c23a">{{ dashboard?.approved ?? 0 }}<span style="font-size:14px">个</span></div>
      </el-card>
    </el-col>
    <el-col :span="isManager ? 5 : 6">
      <el-card shadow="never" style="text-align:center;border-left:3px solid #f56c6c">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">❌ 未达标</div>
        <div style="font-size:28px;font-weight:700;color:#f56c6c">{{ dashboard?.rejected ?? 0 }}<span style="font-size:14px">个</span></div>
      </el-card>
    </el-col>
    <el-col :span="isManager ? 5 : 6">
      <el-card shadow="never" style="text-align:center;border-left:3px solid #e6a23c">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:4px">📝 待提交/审核</div>
        <div style="font-size:28px;font-weight:700;color:#e6a23c">{{ (dashboard?.pending ?? 0) + (dashboard?.not_submitted ?? 0) }}<span style="font-size:14px">个</span></div>
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
