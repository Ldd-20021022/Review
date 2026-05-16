import { defineComponent, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from '/src/shim/element-plus.js'
import { getDirectorDashboard } from '../../api/dashboard.js'
import { rejectAssessment, approveAssessment } from '../../api/assessments.js'

export default defineComponent({
  name: 'DirectorDashboard',
  setup() {
    const router = useRouter()
    const dashboard = ref(null)
    const loading = ref(false)
    const rejectDialog = ref(false)
    const rejectForm = ref({ assessment_id: null, dept_name: '', score: 0, non_compliant: [], feedback: '' })
    const rejecting = ref(false)

    async function fetch() {
      loading.value = true
      try {
        dashboard.value = await getDirectorDashboard()
      } finally {
        loading.value = false
      }
    }

    function goDetail(id) {
      if (id) router.push(`/assessments/${id}`)
    }

    function openReject(row) {
      rejectForm.value = {
        assessment_id: row.assessment_id,
        dept_name: row.name,
        score: row.score || 0,
        non_compliant: row.non_compliant_items || [],
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
        await rejectAssessment(rejectForm.value.assessment_id, rejectForm.value.feedback)
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
        await approveAssessment(row.assessment_id)
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
    const statusColors = {
      approved: 'success',
      rejected: 'danger',
      submitted: 'warning',
      revising: '',
      draft: 'info',
      not_submitted: 'info',
    }

    onMounted(fetch)

    return {
      dashboard, loading, rejectDialog, rejectForm, rejecting,
      goDetail, openReject, handleReject, handleApprove,
      statusMap, statusColors,
    }
  },
  template: `
<div v-loading="loading">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2>🏥 全院评级综合仪表盘</h2>
    <span style="color:#909399">自动刷新</span>
  </div>

  <!-- Stat cards -->
  <el-row :gutter="20" style="margin-bottom:20px">
    <el-col :span="6">
      <el-card shadow="hover" style="text-align:center">
        <p style="color:#909399;font-size:14px;margin:0 0 8px 0">📊 全院均分</p>
        <h1 style="margin:0;color:#409eff">{{ dashboard?.average_score || '-' }}</h1>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" style="text-align:center">
        <p style="color:#909399;font-size:14px;margin:0 0 8px 0">✅ 已达标</p>
        <h1 style="margin:0;color:#67c23a">{{ dashboard?.approved || 0 }} 个</h1>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" style="text-align:center">
        <p style="color:#909399;font-size:14px;margin:0 0 8px 0">❌ 未达标</p>
        <h1 style="margin:0;color:#f56c6c">{{ dashboard?.rejected || 0 }} 个</h1>
      </el-card>
    </el-col>
    <el-col :span="6">
      <el-card shadow="hover" style="text-align:center">
        <p style="color:#909399;font-size:14px;margin:0 0 8px 0">📝 待提交/审核</p>
        <h1 style="margin:0;color:#e6a23c">{{ (dashboard?.pending || 0) + (dashboard?.not_submitted || 0) }} 个</h1>
      </el-card>
    </el-col>
  </el-row>

  <!-- Department table -->
  <el-card>
    <template #header>
      <span style="font-weight:bold">科室评级状态一览</span>
      <span style="color:#909399;font-size:13px;margin-left:8px">
        共 {{ dashboard?.total_departments || 0 }} 个科室
      </span>
    </template>

    <el-table :data="dashboard?.departments || []" stripe>
      <el-table-column label="科室" width="120">
        <template #default="{ row }">🏥 {{ row.name }}</template>
      </el-table-column>
      <el-table-column label="评级周期" width="110">
        <template #default="{ row }">{{ row.rating_cycle || '-' }}</template>
      </el-table-column>
      <el-table-column label="总分" width="90">
        <template #default="{ row }">
          <span v-if="row.score != null" style="font-weight:bold"
            :style="{color: row.score >= 60 ? '#67c23a' : '#f56c6c'}">
            {{ row.score }}
          </span>
          <span v-else style="color:#c0c4cc">-</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="statusColors[row.status] || 'info'">
            {{ statusMap[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="未达标项" width="100">
        <template #default="{ row }">
          <span v-if="row.non_compliant_count > 0" style="color:#f56c6c;font-weight:bold">
            {{ row.non_compliant_count }} 项
          </span>
          <span v-else style="color:#67c23a">-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <div v-if="row.assessment_id" style="display:flex;gap:6px">
            <el-button size="small" @click="goDetail(row.assessment_id)">查看</el-button>
            <el-button v-if="row.status === 'submitted'" size="small" type="success"
              @click="handleApprove(row)">通过</el-button>
            <el-button v-if="row.status === 'submitted'" size="small" type="danger"
              @click="openReject(row)">⭐ 退回</el-button>
          </div>
          <span v-else style="color:#c0c4cc;font-size:12px">暂无提交</span>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <!-- Reject dialog -->
  <el-dialog v-model="rejectDialog" title="❌ 退回科室评级" width="520px">
    <div style="margin-bottom:16px">
      <p><strong>科室：</strong>{{ rejectForm.dept_name }}</p>
      <p><strong>当前得分：</strong>
        <span :style="{color: rejectForm.score >= 60 ? '#e6a23c' : '#f56c6c'}">
          {{ rejectForm.score }} 分（{{ rejectForm.score >= 60 ? '有未达标项' : '未达标' }}）
        </span>
      </p>
    </div>

    <el-form label-width="90px">
      <el-form-item label="退回意见" required>
        <el-input
          v-model="rejectForm.feedback"
          type="textarea"
          :rows="4"
          placeholder="请填写具体的整改意见，科室负责人将收到通知..."
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="rejectDialog = false">取消</el-button>
      <el-button type="danger" @click="handleReject" :loading="rejecting">
        确认退回 ❌
      </el-button>
    </template>
  </el-dialog>
</div>
`,
})
