import { defineComponent, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getReport, getMyRatings } from '../../api/hospital-rating.js'

export default defineComponent({
  name: 'HRReportView',
  setup() {
    const route = useRoute()
    const report = ref(null)
    const list = ref([])
    const loading = ref(false)
    const selectedId = ref(null)

    async function fetchList() {
      list.value = await getMyRatings() || []
    }

    async function fetchReport(id) {
      loading.value = true
      selectedId.value = id
      try {
        report.value = await getReport(id)
      } finally {
        loading.value = false
      }
    }

    onMounted(async () => {
      await fetchList()
      const aid = route.query.assessment
      if (aid) {
        await fetchReport(Number(aid))
      } else if (list.value.length > 0) {
        await fetchReport(list.value[0].id)
      }
    })

    const statusMap = {
      approved: '✅ 已通过',
      rejected: '❌ 已退回',
      submitted: '📝 待审核',
      revising: '🔄 整改中',
      draft: '📋 草稿',
    }

    return { report, list, loading, selectedId, fetchReport, statusMap }
  },
  template: `
<div>
  <h2 style="margin-bottom:20px">📄 评级报告</h2>

  <div v-if="list.length > 0" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
    <el-tag v-for="a in list" :key="a.id"
      :type="selectedId === a.id ? 'primary' : 'info'"
      style="cursor:pointer"
      @click="fetchReport(a.id)">
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
        <div :style="{fontSize:'28px',fontWeight:'700',color:report.passed ? '#67c23a' : '#f56c6c'}">
          {{ report.total_score }}
        </div>
      </el-card>
      <el-card shadow="hover" style="flex:1;text-align:center">
        <span style="font-size:13px;color:#909399">达标率</span>
        <div style="font-size:28px;font-weight:700;color:#409eff">{{ report.compliance_rate }}</div>
      </el-card>
      <el-card shadow="hover" style="flex:1;text-align:center">
        <span style="font-size:13px;color:#909399">状态</span>
        <div style="font-size:18px;">{{ statusMap[report.status] || report.status }}</div>
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
        <el-table-column label="分类" width="120">
          <template #default="{ row }">{{ row.category_name }}</template>
        </el-table-column>
        <el-table-column label="指标" min-width="180">
          <template #default="{ row }">{{ row.name }}</template>
        </el-table-column>
        <el-table-column label="标准值" width="120" align="center">
          <template #default="{ row }">{{ row.standard_value }}{{ row.unit ? ' ' + row.unit : '' }}</template>
        </el-table-column>
        <el-table-column label="实际值" width="120" align="center">
          <template #default="{ row }">
            <span :style="{color: row.is_compliant ? '#67c23a' : '#f56c6c',fontWeight:'600'}">
              {{ row.actual_value || '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="结果" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.is_compliant ? 'success' : 'danger'" size="small">
              {{ row.is_compliant ? '✅ 达标' : '❌ 未达标' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="得分" width="70" align="center">
          <template #default="{ row }">{{ row.score ?? '-' }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</div>
`,
})
