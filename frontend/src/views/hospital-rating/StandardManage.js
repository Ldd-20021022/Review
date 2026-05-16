import { defineComponent, ref, onMounted } from 'vue'
import { getStandards } from '../../api/hospital-rating.js'

export default defineComponent({
  name: 'HRStandardManage',
  setup() {
    const categories = ref([])
    const loading = ref(false)

    async function fetch() {
      loading.value = true
      try {
        categories.value = await getStandards() || []
      } finally {
        loading.value = false
      }
    }

    onMounted(fetch)

    return { categories, loading }
  },
  template: `
<div v-loading="loading">
  <h2 style="margin-bottom:20px">📐 三甲评审标准库</h2>

  <el-card v-if="categories.length === 0">
    <div style="text-align:center;padding:40px;color:#909399">
      <p style="font-size:48px;margin:0">📐</p>
      <p>标准库为空，请通过 Excel 导入或手动添加评审指标</p>
      <p style="font-size:12px;margin-top:8px">后续将支持 Excel 导入和 CRUD 操作</p>
    </div>
  </el-card>

  <el-collapse v-else>
    <el-collapse-item v-for="cat in categories" :key="cat.id" :name="String(cat.id)">
      <template #title>
        <span style="font-weight:600">{{ cat.name }}</span>
        <span style="color:#909399;font-size:12px;margin-left:8px">
          {{ cat.indicators?.length || 0 }} 项指标 · 权重 {{ cat.weight }}%
        </span>
      </template>
      <el-table :data="cat.indicators || []" stripe size="small">
        <el-table-column prop="code" label="编号" width="80" />
        <el-table-column prop="name" label="指标名称" min-width="200" />
        <el-table-column prop="standard_value" label="标准值" width="120" align="center" />
        <el-table-column label="类型" width="120" align="center">
          <template #default="{ row }">
            <el-tag size="small">{{ row.indicator_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="weight" label="权重" width="70" align="center" />
        <el-table-column prop="max_score" label="满分" width="70" align="center" />
      </el-table>
    </el-collapse-item>
  </el-collapse>
</div>
`,
})
