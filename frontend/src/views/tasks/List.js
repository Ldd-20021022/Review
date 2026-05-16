import { defineComponent, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from '/src/shim/element-plus.js'
import { listTasks, createTasks } from '../../api/tasks.js'
import { listAssessments } from '../../api/assessments.js'
import { listDepartments } from '../../api/admin.js'

export default defineComponent({
  name: 'TaskList',
  setup() {
    const router = useRouter()
    const tasks = ref([])
    const assessments = ref([])
    const depts = ref([])
    const filter = ref({ status: '', dept_id: null, assessment_id: null })

    // Create dialog
    const createDialog = ref(false)
    const createForm = ref({ assessment_id: null, indicator_ids: [], dept_id: null, priority: 'medium', due_date: '' })

    async function fetch() {
      const params = {}
      if (filter.value.status) params.status = filter.value.status
      if (filter.value.dept_id) params.dept_id = filter.value.dept_id
      if (filter.value.assessment_id) params.assessment_id = filter.value.assessment_id
      tasks.value = await listTasks(params) || []
    }

    async function loadRefs() {
      assessments.value = await listAssessments() || []
      depts.value = await listDepartments() || []
    }

    function openCreate() {
      createForm.value = { assessment_id: null, indicator_ids: [], dept_id: null, priority: 'medium', due_date: '' }
      createDialog.value = true
    }

    async function doCreate() {
      if (!createForm.value.assessment_id || !createForm.value.indicator_ids.length || !createForm.value.dept_id) {
        ElMessage.warning('请填写完整信息'); return
      }
      const res = await createTasks(createForm.value)
      createDialog.value = false
      ElMessage.success(`已创建 ${res.length} 个整改任务`)
      await fetch()
    }

    function viewTask(id) { router.push(`/tasks/${id}`) }

    const statusMap = { pending: '待开始', in_progress: '进行中', submitted: '已提交', accepted: '已验收', returned: '退回' }
    const statusType = { pending: 'info', in_progress: 'warning', submitted: '', accepted: 'success', returned: 'danger' }
    const priorityType = { low: 'info', medium: 'warning', high: 'danger', urgent: 'danger' }

    onMounted(() => { fetch(); loadRefs() })

    return { tasks, assessments, depts, filter, fetch,
      createDialog, createForm, openCreate, doCreate, viewTask,
      statusMap, statusType, priorityType }
  },
  template: `
<div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h3>整改任务</h3>
    <el-button type="primary" @click="openCreate">批量创建任务</el-button>
  </div>

  <el-card style="margin-bottom:16px">
    <el-row :gutter="12">
      <el-col :span="6">
        <el-select v-model="filter.assessment_id" clearable placeholder="评估项目" @change="fetch">
          <el-option v-for="a in assessments" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>
      </el-col>
      <el-col :span="5">
        <el-select v-model="filter.status" clearable placeholder="状态" @change="fetch">
          <el-option label="待开始" value="pending" /><el-option label="进行中" value="in_progress" />
          <el-option label="已提交" value="submitted" /><el-option label="已验收" value="accepted" />
          <el-option label="退回" value="returned" />
        </el-select>
      </el-col>
      <el-col :span="5">
        <el-select v-model="filter.dept_id" clearable placeholder="科室" @change="fetch">
          <el-option v-for="d in depts" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
      </el-col>
    </el-row>
  </el-card>

  <el-table :data="tasks" stripe @row-click="viewTask" style="cursor:pointer">
    <el-table-column prop="title" label="任务" />
    <el-table-column prop="dept_name" label="责任科室" width="120" />
    <el-table-column label="优先级" width="80">
      <template #default="{ row }"><el-tag :type="priorityType[row.priority]" size="small">{{ row.priority }}</el-tag></template>
    </el-table-column>
    <el-table-column label="状态" width="90">
      <template #default="{ row }"><el-tag :type="statusType[row.status]" size="small">{{ statusMap[row.status] }}</el-tag></template>
    </el-table-column>
    <el-table-column label="截止日期" width="110">
      <template #default="{ row }">{{ row.due_date || '-' }}</template>
    </el-table-column>
    <el-table-column label="操作" width="80">
      <template #default="{ row }">
        <el-button link size="small" @click.stop="viewTask(row.id)">详情</el-button>
      </template>
    </el-table-column>
  </el-table>

  <!-- Create dialog -->
  <el-dialog v-model="createDialog" title="批量创建整改任务" width="550px">
    <el-form :model="createForm" label-width="90px">
      <el-form-item label="评估项目">
        <el-select v-model="createForm.assessment_id" style="width:100%" placeholder="选择已锁定的评估">
          <el-option v-for="a in assessments.filter(x=>x.status==='review'||x.status==='rectifying')" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="指标ID列表">
        <el-input v-model="createForm.indicator_ids" placeholder="用逗号分隔，如：1,2,3" />
        <span style="font-size:12px;color:#909399">输入要整改的评估指标项 ID</span>
      </el-form-item>
      <el-form-item label="责任科室">
        <el-select v-model="createForm.dept_id" style="width:100%">
          <el-option v-for="d in depts" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="优先级">
        <el-select v-model="createForm.priority" style="width:100%">
          <el-option label="低" value="low" /><el-option label="中" value="medium" />
          <el-option label="高" value="high" /><el-option label="紧急" value="urgent" />
        </el-select>
      </el-form-item>
      <el-form-item label="截止日期"><el-input v-model="createForm.due_date" placeholder="YYYY-MM-DD" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="createDialog = false">取消</el-button>
      <el-button type="primary" @click="doCreate">创建</el-button>
    </template>
  </el-dialog>
</div>
`,
})
