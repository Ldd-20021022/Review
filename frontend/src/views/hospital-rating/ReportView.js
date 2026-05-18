import { defineComponent, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from '/src/shim/element-plus.js'
import { getReport, getMyRatings } from '../../api/hospital-rating.js'
import { post } from '../../api/client.js'

export default defineComponent({
  name: 'HRReportView',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const report = ref(null)
    const list = ref([])
    const loading = ref(false)
    const selectedId = ref(null)
    const resubmitting = ref(false)

    async function fetchList() {
      list.value = await getMyRatings() || []
    }

    async function fetchReport(id) {
      loading.value = true
      selectedId.value = id
      try { report.value = await getReport(id) }
      finally { loading.value = false }
    }

    async function handleResubmit() {
      if (!report.value) return
      resubmitting.value = true
      try {
        await post(`/api/assessments/${report.value.assessment_id}/resubmit`)
        ElMessage.success('已提交重新审核')
        await fetchReport(report.value.assessment_id)
        await fetchList()
      } catch (e) {
        ElMessage.error('操作失败: ' + e.message)
      } finally { resubmitting.value = false }
    }

    function goEdit(id) {
      router.push(`/hospital-rating/form?edit=${id}`)
    }

    function exportCSV() {
      if (!report.value || !report.value.items) return
      const rows = [['分类', '指标名称', '标准值', '实际值', '结果', '得分']]
      for (const it of report.value.items) {
        rows.push([
          it.category_name || '', it.name || '',
          (it.standard_value || '') + (it.unit || ''),
          it.actual_value || '',
          it.is_compliant ? '达标' : '未达标',
          it.score ?? '',
        ])
      }
      const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = (report.value.name || 'report') + '.csv'
      a.click()
      URL.revokeObjectURL(url)
    }

    onMounted(async () => {
      await fetchList()
      const aid = route.query.assessment
      if (aid) { await fetchReport(Number(aid)) }
      else if (list.value.length > 0) { await fetchReport(list.value[0].id) }
    })

    const statusMap = {
      approved: '✅ 已通过', rejected: '❌ 已退回',
      submitted: '📝 待审核', revising: '🔄 整改中', draft: '📋 草稿',
    }

    return { report, list, loading, selectedId, resubmitting,
      fetchReport, handleResubmit, goEdit, exportCSV, statusMap }
  },
  template: `
<div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2>📄 评级报告</h2>
    <div v-if="report" style="display:flex;gap:8px">
      <el-button v-if="report.status === 'rejected' || report.status === 'draft'"
        @click="goEdit(report.assessment_id)">✏️ 修改数据</el-button>
      <el-button v-if="report.status === 'rejected' || report.status === 'draft'"
        type="primary" @click="handleResubmit" :loading="resubmitting">📤 提交审核</el-button>
      <el-button @click="exportCSV">📥 导出 CSV</el-button>
    </div>
  </div>

  <div v-if="list.length > 0" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
    <el-tag v-for="a in list" :key="a.id"
      :type="selectedId === a.id ? 'primary' : 'info'"
      style="cursor:pointer" @click="fetchReport(a.id)">
      {{ a.name }} ({{ a.rating_cycle || '-' }})
    </el-tag>
  </div>
  <div v-else style="text-align:center;padding:60px;color:#909399">
    <p style="font-size:48px;margin:0">📄</p>
    <p>暂无评级报告</p>
  </div>

  <div v-if="report" v-loading="loading">
    <div style="display:flex;gap:12px;margin-bottom:16px">
      <el-card shadow="hover" style="flex:1;text-align:center">
        <span style="font-size:13px;color:#909399">总分</span>
        <div :style="{fontSize:'28px',fontWeight:'700',color:report.passed ? '#67c23a' : '#f56c6c'}">{{ report.total_score }}</div>
      </el-card>
      <el-card shadow="hover" style="flex:1;text-align:center">
        <span style="font-size:13px;color:#909399">达标率</span>
        <div style="font-size:28px;font-weight:700;color:#409eff">{{ report.compliance_rate }}</div>
      </el-card>
      <el-card shadow="hover" style="flex:1;text-align:center">
        <span style="font-size:13px;color:#909399">状态</span>
        <div :style="{fontSize:'18px',color:report.status === 'rejected' ? '#f56c6c' : '#374151',fontWeight:report.status==='rejected'?700:400}">{{ statusMap[report.status] || report.status }}</div>
      </el-card>
      <el-card shadow="hover" style="flex:1;text-align:center">
        <span style="font-size:13px;color:#909399">达标 / 总数</span>
        <div style="font-size:28px;font-weight:700">
          <span style="color:#67c23a">{{ report.compliant_count }}</span>
          <span style="color:#c0c4cc">/ {{ report.total_items }}</span>
        </div>
      </el-card>
    </div>

    <el-card>
      <template #header><span style="font-weight:bold">指标明细</span></template>
      <el-table :data="report.items || []" stripe>
        <el-table-column label="分类" width="120"><template #default="{ row }">{{ row.category_name }}</template></el-table-column>
        <el-table-column label="指标" min-width="180"><template #default="{ row }">{{ row.name }}</template></el-table-column>
        <el-table-column label="标准值" width="120" align="center"><template #default="{ row }">{{ row.standard_value }}{{ row.unit ? ' ' + row.unit : '' }}</template></el-table-column>
        <el-table-column label="实际值" width="120" align="center">
          <template #default="{ row }">
            <span :style="{color: row.is_compliant ? '#67c23a' : '#f56c6c',fontWeight:'600'}">{{ row.actual_value || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="结果" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.is_compliant ? 'success' : 'danger'" size="small">{{ row.is_compliant ? '✅ 达标' : '❌ 未达标' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="得分" width="70" align="center"><template #default="{ row }">{{ row.score ?? '-' }}</template></el-table-column>
      </el-table>
    </el-card>

    <!-- Review feedback -->
    <div v-if="report.reviews && report.reviews.length > 0" style="margin-top:16px">
      <el-card v-for="r in report.reviews" :key="r.id"
        :style="{background: r.action === 'rejected' ? '#fff5f5' : '#f0fdf4', marginBottom:'8px'}">
        <template #header>
          <span :style="{fontWeight:'bold',color: r.action === 'rejected' ? '#c62828' : '#16a34a'}">
            {{ r.action === 'rejected' ? '❌ 退回意见' : '✅ 审核通过' }}
          </span>
          <span style="color:#94a3b8;font-size:12px;margin-left:12px">{{ r.reviewed_at?.slice(0,16) || '' }}</span>
        </template>
        <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap">{{ r.feedback || '（无附加意见）' }}</p>
      </el-card>
    </div>
  </div>
</div>
`,
})
