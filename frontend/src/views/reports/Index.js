import { defineComponent, ref, onMounted } from 'vue'
import { ElMessage } from '/src/shim/element-plus.js'
import { listSnapshots } from '../../api/snapshots.js'
import { listAssessments } from '../../api/assessments.js'

export default defineComponent({
  name: 'ReportsPage',
  setup() {
    const snapshots = ref([])
    const assessments = ref([])
    const filterAid = ref(null)
    const loading = ref(false)

    async function fetch() {
      loading.value = true
      try {
        snapshots.value = await listSnapshots(filterAid.value) || []
        assessments.value = await listAssessments() || []
      } finally { loading.value = false }
    }

    async function viewReport(sid) {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`http://localhost:8000/api/reports/preview/${sid}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) throw new Error('加载失败')
        const html = await res.text()
        // Open in new tab via blob
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank')
      } catch (e) {
        ElMessage.error('预览失败: ' + e.message)
      }
    }

    async function downloadReport(sid) {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`http://localhost:8000/api/reports/download/${sid}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) throw new Error('下载失败')
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `评估报告_${sid}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      } catch (e) {
        ElMessage.error('下载失败: ' + e.message)
      }
    }

    onMounted(fetch)

    return { snapshots, assessments, filterAid, loading, fetch, viewReport, downloadReport }
  },
  template: `
<div v-loading="loading">
  <h3 style="margin-bottom:16px">报告管理</h3>
  <p style="color:#909399;margin-bottom:16px">选择快照版本，在线预览或下载评估报告 PDF</p>

  <div style="margin-bottom:16px">
    <el-select v-model="filterAid" clearable placeholder="筛选评估项目" @change="fetch" style="width:240px">
      <el-option v-for="a in assessments" :key="a.id" :label="a.name" :value="a.id" />
    </el-select>
  </div>

  <el-table :data="snapshots" stripe>
    <el-table-column prop="assessment_name" label="评估项目" />
    <el-table-column prop="version" label="版本" width="80" />
    <el-table-column prop="total_score" label="综合得分" width="100">
      <template #default="{ row }">
        <strong :style="{color: row.total_score >= 80 ? '#67c23a' : row.total_score >= 60 ? '#e6a23c' : '#f56c6c'}">
          {{ row.total_score }}%
        </strong>
      </template>
    </el-table-column>
    <el-table-column prop="locked_at" label="锁定时间" width="170">
      <template #default="{ row }">{{ row.locked_at?.slice(0,19) }}</template>
    </el-table-column>
    <el-table-column label="操作" width="180">
      <template #default="{ row }">
        <el-button link size="small" @click="viewReport(row.id)">在线预览</el-button>
        <el-button link size="small" @click="downloadReport(row.id)">下载PDF</el-button>
      </template>
    </el-table-column>
  </el-table>

  <el-empty v-if="!snapshots.length && !loading" description="暂无快照报告" />
</div>
`,
})
