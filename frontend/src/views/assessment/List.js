import { defineComponent, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from '/src/shim/element-plus.js'
import { useAuthStore } from '../../stores/auth.js'
import { listAssessments, createAssessment, myDepartmentAssessments } from '../../api/assessments.js'
import { listCategories } from '../../api/standards.js'

export default defineComponent({
  name: 'AssessmentList',
  setup() {
    const router = useRouter()
    const auth = useAuthStore()
    const assessments = ref([])
    const categories = ref([])
    const dialog = ref(false)
    const form = ref({ name: '', target_level: 5, category_ids: [], rating_cycle: '' })

    const levelOptions = [
      { value: 4, label: '4级' },
      { value: 5, label: '5级' },
      { value: 6, label: '6级' },
    ]

    const cycleOptions = [
      { value: '2024年度', label: '2024年度' },
      { value: '2024-Q1', label: '2024-Q1' },
      { value: '2024-Q2', label: '2024-Q2' },
      { value: '2024-Q3', label: '2024-Q3' },
      { value: '2024-Q4', label: '2024-Q4' },
      { value: '2025年度', label: '2025年度' },
    ]

    async function fetch() {
      categories.value = await listCategories() || []
      if (auth.user?.role === 'dept_head') {
        assessments.value = await myDepartmentAssessments() || []
      } else {
        assessments.value = await listAssessments() || []
      }
    }

    function openCreate() {
      form.value = { name: '', target_level: 5, category_ids: [], rating_cycle: '2025年度' }
      dialog.value = true
    }

    async function handleCreate() {
      if (!form.value.name) { ElMessage.warning('请输入项目名称'); return }
      const res = await createAssessment({
        name: form.value.name,
        target_level: form.value.target_level,
        rating_cycle: form.value.rating_cycle,
        department_id: auth.user?.dept_id || null,
        category_ids: form.value.category_ids.length > 0 ? form.value.category_ids : null,
      })
      dialog.value = false
      ElMessage.success(`创建成功，共 ${res.items.length} 个评估指标`)
      await fetch()
    }

    function goDetail(id) {
      router.push(`/assessments/${id}`)
    }

    const statusMap = {
      draft: '草稿',
      submitted: '待审核',
      approved: '已通过',
      rejected: '已退回',
      revising: '整改中',
      review: '审核中',
    }
    const statusColors = {
      draft: 'info',
      submitted: 'warning',
      approved: 'success',
      rejected: 'danger',
      revising: '',
      review: 'warning',
    }

    onMounted(fetch)

    return {
      assessments, categories, dialog, form, levelOptions, cycleOptions,
      openCreate, handleCreate, goDetail, statusMap, statusColors,
      isDeptHead: auth.user?.role === 'dept_head',
    }
  },
  template: `
<div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h3>{{ isDeptHead ? '我的科室评级' : '评估项目' }}</h3>
    <el-button type="primary" @click="openCreate">{{ isDeptHead ? '新建填报' : '新建评估' }}</el-button>
  </div>

  <el-table :data="assessments" stripe style="cursor:pointer">
    <el-table-column prop="id" label="ID" width="60" />
    <el-table-column prop="name" label="项目名称" />
    <el-table-column prop="rating_cycle" label="评级周期" width="110">
      <template #default="{ row }">{{ row.rating_cycle || '-' }}</template>
    </el-table-column>
    <el-table-column label="目标级别" width="90">
      <template #default="{ row }">
        <el-tag :type="row.target_level === 6 ? 'danger' : row.target_level === 5 ? 'warning' : 'info'">
          {{ row.target_level }}级
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column label="总分" width="80">
      <template #default="{ row }">
        <span v-if="row.total_score != null" style="font-weight:bold"
          :style="{color: row.total_score >= 60 ? '#67c23a' : '#f56c6c'}">
          {{ row.total_score }}
        </span>
        <span v-else style="color:#c0c4cc">-</span>
      </template>
    </el-table-column>
    <el-table-column label="状态" width="100">
      <template #default="{ row }">
        <el-tag :type="statusColors[row.status] || 'info'" size="small">
          {{ statusMap[row.status] || row.status }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column label="创建时间" width="120">
      <template #default="{ row }">{{ row.created_at?.slice(0,10) }}</template>
    </el-table-column>
    <el-table-column label="操作" width="100">
      <template #default="{ row }">
        <el-button link size="small" @click.stop="goDetail(row.id)">进入</el-button>
      </template>
    </el-table-column>
  </el-table>

  <el-dialog v-model="dialog" title="新建评估项目" width="520px">
    <el-form :model="form" label-width="90px">
      <el-form-item label="项目名称"><el-input v-model="form.name" placeholder="如：2025年5级复评自测" /></el-form-item>
      <el-form-item label="评级周期">
        <el-select v-model="form.rating_cycle" style="width:100%" filterable allow-create>
          <el-option v-for="o in cycleOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="目标级别">
        <el-select v-model="form.target_level" style="width:100%">
          <el-option v-for="o in levelOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="评估范围">
        <el-tree-select
          v-model="form.category_ids"
          :data="categories"
          :props="{ children: 'children', label: 'name', value: 'id' }"
          multiple
          check-strictly
          clearable
          placeholder="留空则包含全部指标"
          style="width:100%"
        />
        <span style="font-size:12px;color:#909399">可选择特定分类，留空则评定全部指标</span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog = false">取消</el-button>
      <el-button type="primary" @click="handleCreate">创建</el-button>
    </template>
  </el-dialog>
</div>
`,
})
