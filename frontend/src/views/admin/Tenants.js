import { defineComponent, ref, onMounted } from 'vue'
import { ElMessage } from '/src/shim/element-plus.js'
import { listTenants, createTenant, updateTenant } from '../../api/admin.js'

export default defineComponent({
  name: 'TenantsManagement',
  setup() {
    const tenants = ref([])
    const dialog = ref(false)
    const form = ref({ name: '', contact: '' })
    const editing = ref(null)

    async function fetch() {
      tenants.value = await listTenants() || []
    }

    function open(t = null) {
      editing.value = t
      form.value = t ? { name: t.name, contact: t.contact } : { name: '', contact: '' }
      dialog.value = true
    }

    async function save() {
      if (editing.value) {
        await updateTenant(editing.value.id, form.value)
      } else {
        await createTenant(form.value)
      }
      dialog.value = false
      await fetch()
      ElMessage.success('保存成功')
    }

    onMounted(fetch)

    return { tenants, dialog, form, editing, open, save }
  },
  template: `
<div>
  <h3 style="margin-bottom:16px">租户管理</h3>
  <el-button type="primary" @click="open()" style="margin-bottom:16px">新增租户</el-button>
  <el-table :data="tenants" stripe>
    <el-table-column prop="id" label="ID" width="60" />
    <el-table-column prop="name" label="名称" />
    <el-table-column prop="contact" label="联系人" />
    <el-table-column prop="status" label="状态" width="80" />
    <el-table-column label="操作" width="100">
      <template #default="{ row }">
        <el-button link size="small" @click="open(row)">编辑</el-button>
      </template>
    </el-table-column>
  </el-table>

  <el-dialog v-model="dialog" :title="editing ? '编辑租户' : '新增租户'" width="400px">
    <el-form :model="form" label-width="80px">
      <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
      <el-form-item label="联系人"><el-input v-model="form.contact" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog = false">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</div>
`,
})
