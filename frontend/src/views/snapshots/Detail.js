import { defineComponent, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSnapshot } from '../../api/snapshots.js'

export default defineComponent({
  name: 'SnapshotDetail',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const snap = ref(null)
    const loading = ref(false)

    async function fetch() {
      loading.value = true
      try { snap.value = await getSnapshot(route.params.id) }
      finally { loading.value = false }
    }

    function goBack() { router.push('/snapshots') }

    const scoredCount = () => snap.value?.items?.filter(i => i.score != null).length || 0

    onMounted(fetch)

    return { snap, loading, goBack, scoredCount }
  },
  template: `
<div v-loading="loading">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
    <el-button text @click="goBack">&larr; 返回</el-button>
    <h3>快照详情 — {{ snap?.assessment_name }} ({{ snap?.version }})</h3>
  </div>

  <el-card style="margin-bottom:16px" v-if="snap">
    <el-descriptions :column="4" border>
      <el-descriptions-item label="评估项目">{{ snap.assessment_name }}</el-descriptions-item>
      <el-descriptions-item label="版本">{{ snap.version }}</el-descriptions-item>
      <el-descriptions-item label="目标级别">{{ snap.target_level }}级</el-descriptions-item>
      <el-descriptions-item label="锁定时间">{{ snap.locked_at?.slice(0,19) }}</el-descriptions-item>
      <el-descriptions-item label="综合得分">
        <strong :style="{color: snap.total_score >= 80 ? '#67c23a' : snap.total_score >= 60 ? '#e6a23c' : '#f56c6c', fontSize:'20px'}">
          {{ snap.total_score }}%
        </strong>
      </el-descriptions-item>
      <el-descriptions-item label="总指标数">{{ snap.items?.length }}</el-descriptions-item>
      <el-descriptions-item label="已评分">{{ scoredCount() }}</el-descriptions-item>
    </el-descriptions>
  </el-card>

  <el-card>
    <template #header><span>指标评分明细</span></template>
    <el-table :data="snap?.items || []" stripe>
      <el-table-column prop="category_name" label="分类" width="120" />
      <el-table-column prop="indicator_code" label="编号" width="90" />
      <el-table-column prop="indicator_name" label="指标名称" />
      <el-table-column label="得分" width="90">
        <template #default="{ row }">
          <strong v-if="row.score != null" :style="{color: row.score >= 80 ? '#67c23a' : row.score >= 60 ? '#e6a23c' : '#f56c6c'}">
            {{ row.score }}%
          </strong>
          <span v-else style="color:#c0c4cc">未评分</span>
        </template>
      </el-table-column>
      <el-table-column prop="gap_note" label="差距说明" min-width="150">
        <template #default="{ row }">{{ row.gap_note || '-' }}</template>
      </el-table-column>
    </el-table>
  </el-card>
</div>
`,
})
