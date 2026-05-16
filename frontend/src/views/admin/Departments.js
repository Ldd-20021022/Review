import { defineComponent, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from '/src/shim/element-plus.js'
import { listDepartments, createDepartment, updateDepartment, deleteDepartment } from '../../api/admin.js'

export default defineComponent({
  name: 'DepartmentsManagement',
  setup() {
    const depts = ref([])
    const dialog = ref(false)
    const form = ref({ name: '', parent_id: null })
    const editing = ref(null)

    async function fetch() {
      depts.value = await listDepartments() || []
    }

    function open(d = null) {
      editing.value = d
      form.value = d ? { name: d.name, parent_id: d.parent_id } : { name: '', parent_id: null }
      dialog.value = true
    }

    async function save() {
      if (editing.value) {
        await updateDepartment(editing.value.id, form.value)
      } else {
        await createDepartment(form.value)
      }
      dialog.value = false
      await fetch()
      ElMessage.success('保存成功')
    }

    async function remove(d) {
      await ElMessageBox.confirm('确认删除该科室？', '警告', { type: 'warning' })
      await deleteDepartment(d.id)
      await fetch()
      ElMessage.success('已删除')
    }

    onMounted(fetch)

    return { depts, dialog, form, editing, open, save, remove }
  },
  template: `
<div>
  <h3 style="margin-bottom:16px">科室管理</h3>
  <el-button type="primary" @click="open()" style="margin-bottom:16px">新增科室</el-button>
  <el-table :data="depts" stripe>
    <el-table-column prop="id" label="ID" width="60" />
    <el-table-column prop="name" label="名称" />
    <el-table-column label="操作" width="160">
      <template #default="{ row }">
        <el-button link size="small" @click="open(row)">编辑</el-button>
        <el-button link size="small" @click="remove(row)" style="color:#f56c6c">删除</el-button>
      </template>
    </el-table-column>
  </el-table>

  <el-dialog v-model="dialog" :title="editing ? '编辑科室' : '新增科室'" width="400px">
    <el-form :model="form" label-width="80px">
      <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog = false">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</div>
`,
})
