import { defineComponent, ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from '/src/shim/element-plus.js'
import { useAuthStore } from '../../stores/auth.js'
import { getDashboard, approveRating, rejectRating, getReport } from '../../api/hospital-rating.js'

export default defineComponent({
  name: 'HRDashboard',
  setup() {
    const router = useRouter()
    const auth = useAuthStore()
    const dashboard = ref(null)
    const loading = ref(false)
    const rejectDialog = ref(false)
    const rejectForm = ref({ assessment_id: null, dept_name: '', score: 0, feedback: '', batch: false })
    const rejecting = ref(false)
    const selected = ref(new Set())
    const batchProcessing = ref(false)

    const isManager = computed(() =>
      auth.user?.role === 'admin' || auth.user?.role === 'director'
    )

    function toggleSelect(aid) {
      const s = new Set(selected.value)
      s.has(aid) ? s.delete(aid) : s.add(aid)
      selected.value = s
    }

    function selectAllSubmitted() {
      const submitted = (dashboard.value?.departments || [])
        .filter(d => d.status === 'submitted' && d.assessment_id)
        .map(d => d.assessment_id)
      selected.value = new Set(submitted)
    }

    function clearSelection() { selected.value = new Set() }

    async function batchApprove() {
      const ids = [...selected.value]
      if (ids.length === 0) { ElMessage.warning('请选择科室'); return }
      await ElMessageBox.confirm(`确认通过 ${ids.length} 个科室的评级吗？`, '批量通过', { type: 'success' })
      batchProcessing.value = true
      let ok = 0
      for (const id of ids) {
        try { await approveRating(id); ok++ } catch (_) {}
      }
      ElMessage.success(`已通过 ${ok}/${ids.length} 个科室`)
      clearSelection()
      batchProcessing.value = false
      await fetch()
    }

    function openBatchReject() {
      const ids = [...selected.value]
      if (ids.length === 0) { ElMessage.warning('请选择科室'); return }
      const deptNames = (dashboard.value?.departments || [])
        .filter(d => ids.includes(d.assessment_id)).map(d => d.name).join('、')
      rejectForm.value = { assessment_id: ids[0], dept_name: `${ids.length} 个科室 (${deptNames})`, score: 0, feedback: '', batch: true, ids }
      rejectDialog.value = true
    }

    async function handleReject() {
      if (!rejectForm.value.feedback.trim()) { ElMessage.warning('请填写退回意见'); return }
      rejecting.value = true
      const ids = rejectForm.value.batch ? rejectForm.value.ids : [rejectForm.value.assessment_id]
      try {
        let ok = 0
        for (const id of ids) {
          try { await rejectRating(id, rejectForm.value.feedback); ok++ } catch (_) {}
        }
        ElMessage.success(`已退回 ${ok}/${ids.length} 个科室`)
        rejectDialog.value = false
        clearSelection()
        await fetch()
      } catch (e) { ElMessage.error('操作失败: ' + e.message) }
      finally { rejecting.value = false }
    }

    function exportDashboardCSV() {
      const depts = dashboard.value?.departments || []
      const rows = [['科室', '评级周期', '总分', '状态', '未达标项数']]
      for (const d of depts) {
        rows.push([d.name, d.rating_cycle || '-', d.score ?? '-',
          statusMap[d.status] || d.status, d.non_compliant_count || 0])
      }
      const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = '全院评级数据.csv'
      a.click()
      URL.revokeObjectURL(url)
    }

    const deptReport = ref(null)

    async function fetch() {
      loading.value = true
      try {
        dashboard.value = await getDashboard()
        if (!isManager.value && dashboard.value?.departments?.length > 0) {
          const aid = dashboard.value.departments[0].assessment_id
          if (aid) {
            try { deptReport.value = await getReport(aid) }
            catch (_) { deptReport.value = null }
          }
        }
      } finally { loading.value = false }
    }

    function goReport(id) {
      if (id) router.push(`/hospital-rating/reports?assessment=${id}`)
    }

    function openReject(row) {
      rejectForm.value = {
        assessment_id: row.assessment_id,
        dept_name: row.name,
        score: row.score || 0,
        feedback: '',
      }
      rejectDialog.value = true
    }

    async function handleReject() {
      if (!rejectForm.value.feedback.trim()) {
        ElMessage.warning('请填写退回意见')
        return
      }
      rejecting.value = true
      try {
        await rejectRating(rejectForm.value.assessment_id, rejectForm.value.feedback)
        ElMessage.success('已退回并通知科室负责人')
        rejectDialog.value = false
        await fetch()
      } catch (e) {
        ElMessage.error('操作失败: ' + e.message)
      } finally {
        rejecting.value = false
      }
    }

    async function handleApprove(row) {
      await ElMessageBox.confirm(
        `确认通过【${row.name}】的评级吗？`,
        '确认通过',
        { type: 'success' }
      )
      try {
        await approveRating(row.assessment_id)
        ElMessage.success('已通过')
        await fetch()
      } catch (e) {
        ElMessage.error('操作失败: ' + e.message)
      }
    }

    const statusMap = {
      approved: '✅ 已通过',
      rejected: '❌ 已退回',
      submitted: '📝 待审核',
      revising: '🔄 整改中',
      draft: '📋 草稿',
      not_submitted: '📋 未提交',
    }

    onMounted(fetch)

    return {
      dashboard, loading, rejectDialog, rejectForm, rejecting, isManager, selected, batchProcessing, deptReport,
      goReport, openReject, handleReject, handleApprove, statusMap, exportDashboardCSV,
      toggleSelect, selectAllSubmitted, clearSelection, batchApprove, openBatchReject,
    }
  },
  template: `
<div v-loading="loading">
  <h2 style="margin-bottom:20px">{{ isManager ? '🏥 全院三甲评级综合仪表盘' : '📊 本科室评级概览' }}</h2>
  <el-button v-if="isManager" @click="exportDashboardCSV" style="float:right;margin-top:-44px" size="small">📥 导出 CSV</el-button>

  <el-row :gutter="16" style="margin-bottom:20px">
    <el-col :span="6">
      <el-card shadow="hover" style="text-align:center;border-left:3px solid #409eff">
        <p style="color:#909399;font-size:13px;margin:0 0 8px">📊 {{ isManager ? '全院均分' : '科室得分' }}</p>
        <h1 style="margin:0;color:#409eff;font-size:28px">{{ dashboard?.average_score ?? '-' }}</h1>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" style="text-align:center;border-left:3px solid #67c23a">
        <p style="color:#909399;font-size:13px;margin:0 0 8px">✅ 已达标</p>
        <h1 style="margin:0;color:#67c23a;font-size:28px">{{ dashboard?.approved ?? 0 }} 个</h1>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" style="text-align:center;border-left:3px solid #f56c6c">
        <p style="color:#909399;font-size:13px;margin:0 0 8px">❌ 未达标</p>
        <h1 style="margin:0;color:#f56c6c;font-size:28px">{{ dashboard?.rejected ?? 0 }} 个</h1>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" style="text-align:center;border-left:3px solid #e6a23c">
        <p style="color:#909399;font-size:13px;margin:0 0 8px">📝 待提交/审核</p>
        <h1 style="margin:0;color:#e6a23c;font-size:28px">{{ (dashboard?.pending ?? 0) + (dashboard?.not_submitted ?? 0) }} 个</h1>
      </el-card>
    </el-col>
  </el-row>

  <el-card v-if="isManager">
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span>
          <span style="font-weight:bold">科室评级状态一览</span>
          <span style="color:#909399;font-size:12px;margin-left:8px">共 {{ dashboard?.total_departments ?? 0 }} 个科室</span>
        </span>
        <div v-if="selected.size > 0" style="display:flex;gap:6px">
          <span style="font-size:13px;color:#64748b">已选 {{ selected.size }} 个</span>
          <el-button size="small" type="success" @click="batchApprove" :loading="batchProcessing">✅ 批量通过</el-button>
          <el-button size="small" type="danger" @click="openBatchReject">❌ 批量退回</el-button>
          <el-button size="small" @click="clearSelection">取消选择</el-button>
        </div>
        <div v-else>
          <el-button size="small" @click="selectAllSubmitted">全选待审核</el-button>
        </div>
      </div>
    </template>

    <el-table :data="dashboard?.departments ?? []" stripe @selection-change="()=>{}">
      <el-table-column width="40" align="center">
        <template #default="{ row }">
          <el-checkbox v-if="row.status === 'submitted' && row.assessment_id"
            :model-value="selected.has(row.assessment_id)"
            @change="toggleSelect(row.assessment_id)" />
        </template>
      </el-table-column>
      <el-table-column label="科室" width="120">
        <template #default="{ row }">🏥 {{ row.name }}</template>
      </el-table-column>
      <el-table-column label="评级周期" width="110">
        <template #default="{ row }">{{ row.rating_cycle || '-' }}</template>
      </el-table-column>
      <el-table-column label="总分" width="160" align="center">
        <template #default="{ row }">
          <div v-if="row.score != null" style="display:flex;align-items:center;gap:6px">
            <el-progress :percentage="row.score" :color="row.score >= 60 ? '#67c23a' : '#f56c6c'" :stroke-width="6" style="flex:1" />
            <span :style="{fontWeight:'bold',color:row.score >= 60 ? '#67c23a' : '#f56c6c',fontSize:'13px'}">{{ row.score }}</span>
          </div>
          <span v-else style="color:#c0c4cc">-</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : row.status === 'submitted' ? 'warning' : 'info'" size="small">
            {{ statusMap[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="未达标项" width="100" align="center">
        <template #default="{ row }">
          <span v-if="row.non_compliant_count > 0" style="color:#f56c6c;font-weight:bold">{{ row.non_compliant_count }} 项</span>
          <span v-else style="color:#67c23a">-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <div v-if="row.assessment_id" style="display:flex;gap:6px">
            <el-button size="small" @click="goReport(row.assessment_id)">查看报告</el-button>
            <el-button v-if="row.status === 'submitted'" size="small" type="success" @click="handleApprove(row)">通过</el-button>
            <el-button v-if="row.status === 'submitted'" size="small" type="danger" @click="openReject(row)">⭐ 退回</el-button>
          </div>
          <span v-else style="color:#c0c4cc;font-size:12px">暂未提交</span>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-card v-else-if="dashboard?.departments?.length > 0" style="margin-bottom:16px">
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:bold">📊 本科室指标概况</span>
        <el-tag :type="dashboard.departments[0].status === 'rejected' ? 'danger' : dashboard.departments[0].status === 'approved' ? 'success' : 'warning'" size="small">
          {{ statusMap[dashboard.departments[0].status] || dashboard.departments[0].status }}
        </el-tag>
      </div>
    </template>
    <el-row :gutter="16" style="margin-bottom:12px">
      <el-col :span="8">
        <div style="text-align:center;padding:8px;background:#f8fafc;border-radius:6px">
          <div style="font-size:20px;font-weight:700" :style="{color: (dashboard.departments[0].score || 0) >= 60 ? '#67c23a' : '#f56c6c'}">{{ dashboard.departments[0].score ?? '-' }}</div>
          <div style="font-size:11px;color:#94a3b8">总分</div>
        </div>
      </el-col>
      <el-col :span="8">
        <div style="text-align:center;padding:8px;background:#f8fafc;border-radius:6px">
          <div style="font-size:20px;font-weight:700;color:#f56c6c">{{ dashboard.departments[0].non_compliant_count || 0 }}</div>
          <div style="font-size:11px;color:#94a3b8">未达标项</div>
        </div>
      </el-col>
      <el-col :span="8">
        <div style="text-align:center;padding:8px;background:#f8fafc;border-radius:6px">
          <div style="font-size:20px;font-weight:700;color:#3b82f6">{{ dashboard.departments[0].total_items || 0 }}</div>
          <div style="font-size:11px;color:#94a3b8">总指标数</div>
        </div>
      </el-col>
    </el-row>
    <!-- Non-compliant items with gaps -->
    <div v-if="deptReport?.items" style="margin-top:12px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#c62828" v-if="deptReport.items.filter(i=>!i.is_compliant).length > 0">
        ⚠️ 未达标指标 ({{ deptReport.items.filter(i=>!i.is_compliant).length }} 项)
      </div>
      <div v-for="it in deptReport.items.filter(i=>!i.is_compliant)" :key="it.id"
        style="padding:6px 10px;margin-bottom:4px;background:#fff5f5;border-radius:4px;font-size:13px;display:flex;justify-content:space-between;align-items:center">
        <span>{{ it.category_name }} · {{ it.name }}</span>
        <span style="color:#c62828;font-weight:600">
          {{ it.actual_value || '-' }} / {{ it.standard_value }}{{ it.unit || '' }}
        </span>
      </div>
      <div v-if="deptReport.items.filter(i=>!i.is_compliant).length === 0" style="color:#67c23a;font-size:13px;text-align:center;padding:12px">
        ✅ 全部达标
      </div>
    </div>
    <el-button v-if="dashboard.departments[0].assessment_id" size="small" type="primary" style="margin-top:8px"
      @click="goReport(dashboard.departments[0].assessment_id)">查看完整报告 →</el-button>
  </el-card>

  <el-dialog v-if="isManager" v-model="rejectDialog" :title="rejectForm.batch ? '❌ 批量退回科室评级' : '❌ 退回科室评级'" width="500px">
    <div style="margin-bottom:16px">
      <p><strong>科室：</strong>{{ rejectForm.dept_name }}</p>
      <p v-if="!rejectForm.batch"><strong>当前得分：</strong>
        <span :style="{color: rejectForm.score >= 60 ? '#e6a23c' : '#f56c6c',fontWeight:'bold'}">{{ rejectForm.score }} 分</span>
      </p>
    </div>
    <el-form label-width="90px">
      <el-form-item label="退回意见" required>
        <el-input v-model="rejectForm.feedback" type="textarea" :rows="4"
          placeholder="请填写具体的整改意见，科室负责人将收到通知..." />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="rejectDialog = false">取消</el-button>
      <el-button type="danger" @click="handleReject" :loading="rejecting">确认退回 ❌</el-button>
    </template>
  </el-dialog>
</div>
`,
})
