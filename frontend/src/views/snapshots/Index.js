import { defineComponent, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { listSnapshots, compareSnapshots } from '../../api/snapshots.js'
import { listAssessments } from '../../api/assessments.js'

export default defineComponent({
  name: 'SnapshotList',
  setup() {
    const router = useRouter()
    const snapshots = ref([])
    const assessments = ref([])
    const filterAid = ref(null)

    // Compare
    const compareDialog = ref(false)
    const snap1 = ref(null)
    const snap2 = ref(null)
    const compareResult = ref(null)
    const comparing = ref(false)

    async function fetch() {
      snapshots.value = await listSnapshots(filterAid.value) || []
      assessments.value = await listAssessments() || []
    }

    function onFilterChange() {
      fetch()
    }

    function viewDetail(id) {
      router.push(`/snapshots/${id}`)
    }

    function openCompare() {
      snap1.value = null
      snap2.value = null
      compareResult.value = null
      compareDialog.value = true
    }

    async function doCompare() {
      if (!snap1.value || !snap2.value) return
      comparing.value = true
      try {
        compareResult.value = await compareSnapshots(snap1.value, snap2.value)
      } finally {
        comparing.value = false
      }
    }

    function viewReport(sid) {
      window.open(`http://localhost:8000/api/reports/preview/${sid}?token=${localStorage.getItem('token')}`, '_blank')
    }

    function downloadReport(sid) {
      const token = localStorage.getItem('token')
      const url = `http://localhost:8000/api/reports/download/${sid}?token=${token}`
      window.open(url, '_blank')
    }

    onMounted(fetch)

    return {
      snapshots, assessments, filterAid, fetch, onFilterChange, viewDetail,
      compareDialog, snap1, snap2, compareResult, comparing, openCompare, doCompare,
      viewReport, downloadReport,
    }
  },
  template: `
<div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h3>评估快照</h3>
    <el-button type="primary" @click="openCompare">版本对比</el-button>
  </div>

  <div style="margin-bottom:16px">
    <el-select v-model="filterAid" clearable placeholder="筛选评估项目" @change="onFilterChange" style="width:240px">
      <el-option v-for="a in assessments" :key="a.id" :label="a.name" :value="a.id" />
    </el-select>
  </div>

  <el-table :data="snapshots" stripe>
    <el-table-column prop="version" label="版本" width="80" />
    <el-table-column prop="assessment_name" label="评估项目" />
    <el-table-column label="目标级别" width="80">
      <template #default="{ row }">{{ row.target_level }}级</template>
    </el-table-column>
    <el-table-column prop="total_score" label="综合得分" width="100">
      <template #default="{ row }">
        <strong :style="{color: row.total_score >= 80 ? '#67c23a' : row.total_score >= 60 ? '#e6a23c' : '#f56c6c'}">
          {{ row.total_score }}%
        </strong>
      </template>
    </el-table-column>
    <el-table-column label="锁定时间" width="170">
      <template #default="{ row }">{{ row.locked_at?.slice(0,19) }}</template>
    </el-table-column>
    <el-table-column label="操作" width="240">
      <template #default="{ row }">
        <el-button link size="small" @click="viewDetail(row.id)">详情</el-button>
        <el-button link size="small" @click="viewReport(row.id)">预览报告</el-button>
        <el-button link size="small" @click="downloadReport(row.id)">下载PDF</el-button>
      </template>
    </el-table-column>
  </el-table>

  <!-- Compare Dialog -->
  <el-dialog v-model="compareDialog" title="快照版本对比" width="900px">
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="10">
        <el-select v-model="snap1" placeholder="选择版本1" style="width:100%">
          <el-option v-for="s in snapshots" :key="s.id" :label="s.assessment_name + ' - ' + s.version + ' (' + s.total_score + '%)'" :value="s.id" />
        </el-select>
      </el-col>
      <el-col :span="4" style="text-align:center;line-height:32px">VS</el-col>
      <el-col :span="10">
        <el-select v-model="snap2" placeholder="选择版本2" style="width:100%">
          <el-option v-for="s in snapshots" :key="s.id" :label="s.assessment_name + ' - ' + s.version + ' (' + s.total_score + '%)'" :value="s.id" />
        </el-select>
      </el-col>
    </el-row>
    <el-button type="primary" @click="doCompare" :loading="comparing" :disabled="!snap1 || !snap2" style="margin-bottom:16px">开始对比</el-button>

    <div v-if="compareResult">
      <el-alert :title="'综合得分变化: ' + (compareResult.score_diff > 0 ? '+' : '') + compareResult.score_diff + '%'"
        :type="compareResult.score_diff >= 0 ? 'success' : 'warning'" :closable="false" style="margin-bottom:16px" />

      <el-table :data="compareResult.items_diff" stripe>
        <el-table-column prop="category_name" label="分类" width="100" />
        <el-table-column prop="indicator_code" label="编号" width="90" />
        <el-table-column prop="indicator_name" label="指标" />
        <el-table-column label="V1" width="70">
          <template #default="{ row }">{{ row.score1 ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="V2" width="70">
          <template #default="{ row }">{{ row.score2 ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="变化" width="80">
          <template #default="{ row }">
            <span :style="{color: row.diff > 0 ? '#67c23a' : row.diff < 0 ? '#f56c6c' : '#909399', fontWeight:'bold'}">
              {{ row.diff > 0 ? '+' : '' }}{{ row.diff }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-dialog>
</div>
`,
})
