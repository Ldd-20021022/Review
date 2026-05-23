import { defineComponent, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from '/src/shim/element-plus.js'
import { getReport, getMyRatings, compareHistory, getGapAnalysis } from '../../api/hospital-rating.js'
import { getAISummary, getHealthCommissionExport, aiAsyncWithPolling } from '../../api/ai.js'
import { post, BASE_URL } from '../../api/client.js'
import { radarChart } from '../../utils/charts.js'

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
    const history = ref(null)
    const gapAnalysis = ref(null)
    const analyzing = ref(false)
    const aiReport = ref(null)
    const anomalies = ref([])
    const aiLoading = ref(false)

    async function fetchList() {
      list.value = await getMyRatings() || []
    }

    async function fetchReport(id) {
      loading.value = true
      selectedId.value = id
      try { report.value = await getReport(id); updateRadar() }
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

    const aiProgress = ref('')

    async function fetchAISummary() {
      if (!report.value) return
      aiLoading.value = true
      aiProgress.value = '正在提交AI分析任务...'
      try {
        const { result, error, timedOut } = await aiAsyncWithPolling('summary', { aid: report.value.assessment_id }, {
          onProgress: ({ status, elapsed }) => {
            aiProgress.value = status === 'running' ? `AI 正在分析中... (已等待 ${elapsed}秒)` : ''
          }
        })
        if (error) { ElMessage.error(error); return }
        if (result) {
          aiReport.value = result.report
          anomalies.value = result.anomalies || []
        }
      } catch (e) { ElMessage.error('AI分析失败: ' + e.message) }
      finally { aiLoading.value = false; aiProgress.value = '' }
    }

    async function exportJSON() {
      if (!report.value) return
      try {
        const data = await getHealthCommissionExport(report.value.assessment_id)
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = (report.value.name || 'export') + '_卫健委格式.json'
        a.click(); URL.revokeObjectURL(url)
      } catch (e) { ElMessage.error('导出失败') }
    }

    async function fetchGapAnalysis() {
      if (!report.value) return
      analyzing.value = true
      try {
        const { result, error } = await aiAsyncWithPolling('gap_analysis', { aid: report.value.assessment_id })
        if (error) { ElMessage.error(error); return }
        if (result) gapAnalysis.value = result
      } catch (e) { ElMessage.error('分析失败: ' + e.message) }
      finally { analyzing.value = false }
    }

    async function fetchHistory() {
      if (!report.value) return
      try {
        // Use compareHistory for cross-cycle comparison
        const deptId = report.value.department_id
        if (deptId) {
          history.value = await compareHistory(deptId)
        } else {
          // Fallback: show all user's assessments
          history.value = await getMyRatings()
        }
      } catch (_) {
        try { history.value = await getMyRatings() } catch (__) { history.value = null }
      }
    }

    const radarHTML = ref('')

    function updateRadar() {
      const cats = report.value?.categories_breakdown
      if (!cats || cats.length < 3) { radarHTML.value = ''; return }
      const axes = cats.slice(0, 8).map(c => c.name.slice(0, 4))
      const values = cats.slice(0, 8).map(c => c.rate)
      radarHTML.value = radarChart(axes, values, 280)
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
      await fetchHistory()
    })

    const statusMap = {
      approved: '✅ 已通过', rejected: '❌ 已退回',
      submitted: '📝 待审核', revising: '🔄 整改中', draft: '📋 草稿',
    }

    return { report, list, loading, selectedId, resubmitting, history, gapAnalysis, analyzing,
      aiReport, anomalies, aiLoading, aiProgress, radarHTML, BASE_URL,
      fetchReport, handleResubmit, goEdit, exportCSV, fetchGapAnalysis, fetchAISummary, exportJSON, statusMap }
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
      <a :href="BASE_URL + '/api/hospital-ratings/report/' + report.assessment_id + '/pdf'" target="_blank" style="text-decoration:none">
        <el-button>📄 下载 PDF</el-button>
      </a>
      <el-button @click="fetchAISummary" :loading="aiLoading" type="warning">🤖 AI 智能报告</el-button>
      <el-button @click="fetchGapAnalysis" :loading="analyzing" type="warning">🔍 差距分析</el-button>
      <el-button @click="exportJSON">📋 卫健委格式</el-button>
      <el-button @click="exportCSV">📥 导出 CSV</el-button>
      <el-button @click="window.print()">🖨️ 打印</el-button>
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

    <el-card v-if="report.categories_breakdown" style="margin-bottom:16px">
      <template #header><span style="font-weight:bold">分类达标情况</span></template>
      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
        <div v-if="radarHTML" v-html="radarHTML" style="flex-shrink:0" />
        <div style="flex:1;min-width:300px;display:flex;gap:12px;flex-wrap:wrap">
          <div v-for="cat in report.categories_breakdown" :key="cat.name"
            style="flex:1;min-width:140px;padding:12px;border-radius:8px;background:#f8fafc;text-align:center">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px">{{ cat.name }}</div>
            <el-progress :percentage="cat.rate" :color="cat.rate >= 80 ? '#67c23a' : cat.rate >= 60 ? '#e6a23c' : '#f56c6c'" :stroke-width="8" />
            <div style="font-size:12px;color:#94a3b8;margin-top:4px">{{ cat.compliant }}/{{ cat.total }} 达标</div>
          </div>
        </div>
      </div>
    </el-card>

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

    <!-- AI progress indicator -->
    <div v-if="aiProgress" style="text-align:center;padding:16px;margin-top:8px;background:#f0f9ff;border-radius:8px;color:#3b82f6;font-size:13px">
      ⏳ {{ aiProgress }}
    </div>

    <!-- AI Intelligent Report -->
    <el-card v-if="aiReport" style="margin-top:16px;border-left:4px solid #3b82f6">
      <template #header>
        <span style="font-weight:bold">🤖 AI 智能报告</span>
        <span style="color:#94a3b8;font-size:12px;margin-left:8px">分数: {{ aiReport.score }} {{ aiReport.passed ? '✅ 达标' : '❌ 未达标' }}</span>
      </template>
      <div style="line-height:1.8;color:#475569;white-space:pre-wrap;font-size:14px">{{ aiReport.markdown }}</div>
      <!-- Anomalies -->
      <div v-if="anomalies.length > 0" style="margin-top:16px;padding:12px;background:#fff7ed;border-radius:6px">
        <strong style="color:#c2410c">⚠️ 异常数据检测 ({{ anomalies.length }} 项)：</strong>
        <div v-for="(a, i) in anomalies" :key="i" style="font-size:13px;color:#9a3412;margin-top:4px">
          {{ a.indicator }} — {{ a.detail }} ({{ a.severity === 'high' ? '🔴严重' : a.severity === 'medium' ? '🟡注意' : '🔵提示' }})
        </div>
      </div>
    </el-card>

    <!-- AI Gap Analysis -->
    <el-card v-if="gapAnalysis" style="margin-top:16px;border-left:4px solid #e6a23c">
      <template #header>
        <span style="font-weight:bold">🔍 AI 差距分析 — {{ gapAnalysis.overall_assessment }}</span>
        <span style="color:#94a3b8;font-size:12px;margin-left:8px">
          🔴 {{ gapAnalysis.urgent_count }}紧急 🟠 {{ gapAnalysis.high_count }}高优 🔵 {{ gapAnalysis.non_compliant_count }}未达标
        </span>
      </template>
      <div v-for="(r, i) in gapAnalysis.recommendations" :key="i"
        style="padding:10px 12px;margin-bottom:6px;border-radius:6px;font-size:13px"
        :style="{background: r.priority === 'urgent' ? '#fef2f2' : r.priority === 'high' ? '#fff7ed' : '#f8fafc'}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-weight:600">{{ i+1 }}. {{ r.indicator_name }}</span>
          <el-tag :type="r.priority === 'urgent' ? 'danger' : r.priority === 'high' ? 'warning' : 'info'" size="small">
            {{ r.priority === 'urgent' ? '🔴 紧急' : r.priority === 'high' ? '🟠 高优' : '🔵 一般' }}
          </el-tag>
        </div>
        <div style="color:#94a3b8;margin-bottom:4px">
          当前: <span style="color:#f56c6c;font-weight:600">{{ r.current_value }}</span>
          → 目标: <span style="color:#16a34a;font-weight:600">{{ r.target_value }}</span>
          (差距 {{ r.gap_pct }}%)
        </div>
        <div style="color:#475569;line-height:1.5">{{ r.suggestion }}</div>
        <div style="color:#94a3b8;font-size:11px;margin-top:4px">⏱ 建议整改期限: {{ r.timeline }}</div>
      </div>
    </el-card>

    <!-- History Comparison -->
    <el-card v-if="list.length > 1" style="margin-top:16px">
      <template #header><span style="font-weight:bold">📈 历史对比</span></template>
      <el-table :data="list" stripe size="small">
        <el-table-column label="评级周期" prop="rating_cycle" />
        <el-table-column label="总分" align="center">
          <template #default="{ row }">
            <span :style="{fontWeight:'bold',color: (row.total_score||0) >= 60 ? '#67c23a' : '#f56c6c'}">{{ row.total_score ?? '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" align="center">
          <template #default="{ row }">{{ statusMap[row.status] || row.status }}</template>
        </el-table-column>
        <el-table-column label="操作" align="center" width="80">
          <template #default="{ row }">
            <el-button link size="small" @click="fetchReport(row.id)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</div>
`,
})
