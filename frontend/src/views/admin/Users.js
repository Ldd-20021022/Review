import { defineComponent, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from '/src/shim/element-plus.js'
import { listUsers, addUser, updateUserRole, removeUser } from '../../api/admin.js'
import { listDepartments } from '../../api/admin.js'
import { BASE_URL } from '../../api/client.js'

export default defineComponent({
  name: 'UsersManagement',
  setup() {
    const users = ref([])
    const depts = ref([])
    const dialog = ref(false)
    const form = ref({ phone: '', name: '', password: '123456', role: 'expert', dept_id: null })

    async function fetch() {
      users.value = await listUsers() || []
      depts.value = await listDepartments() || []
    }

    function open() {
      form.value = { phone: '', name: '', password: '123456', role: 'expert', dept_id: null }
      dialog.value = true
    }

    async function save() {
      await addUser(form.value)
      dialog.value = false
      await fetch()
      ElMessage.success('添加成功')
    }

    async function changeRole(ut, newRole) {
      await updateUserRole(ut.id, newRole, ut.dept_id)
      await fetch()
      ElMessage.success('角色已更新')
    }

    async function remove(ut) {
      await ElMessageBox.confirm('确认从当前租户移除该用户？', '警告', { type: 'warning' })
      await removeUser(ut.id)
      await fetch()
      ElMessage.success('已移除')
    }

    async function resetPwd(user) {
      try {
        await ElMessageBox.confirm('确认重置【' + user.user_name + '】的密码？', '重置密码', { type: 'warning' })
      } catch (_) { return }
      try {
        const r = await (await fetch(BASE_URL + '/api/users/' + user.user_id + '/reset-password', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token'), 'Content-Type': 'application/json' }
        })).json()
        ElMessage.success('密码已重置为: ' + r.new_password + '  (用户: ' + r.phone + ')')
      } catch (e) { ElMessage.error('操作失败: ' + (e.message || '')) }
    }

    onMounted(fetch)

    return { users, depts, dialog, form, open, save, changeRole, remove, resetPwd }
  },
  template: `
<div>
  <h3 style="margin-bottom:16px">用户管理</h3>
  <el-button type="primary" @click="open()" style="margin-bottom:16px">添加用户</el-button>
  <el-table :data="users" stripe>
    <el-table-column prop="user_name" label="姓名" />
    <el-table-column prop="user_phone" label="手机号" />
    <el-table-column prop="dept_name" label="科室" />
    <el-table-column prop="role" label="角色" width="140">
      <template #default="{ row }">
        <el-select :model-value="row.role" size="small" @change="changeRole(row, $event)" style="width:120px">
          <el-option label="专家" value="expert" />
          <el-option label="科室负责人" value="dept_head" />
          <el-option label="院领导" value="leader" />
          <el-option label="管理员" value="admin" />
        </el-select>
      </template>
    </el-table-column>
    <el-table-column label="操作" width="160">
      <template #default="{ row }">
        <el-button link size="small" @click="resetPwd(row)">🔑 重置密码</el-button>
        <el-button link size="small" @click="remove(row)" style="color:#f56c6c">移除</el-button>
      </template>
    </el-table-column>
  </el-table>

  <el-dialog v-model="dialog" title="添加用户" width="450px">
    <el-form :model="form" label-width="80px">
      <el-form-item label="手机号"><el-input v-model="form.phone" /></el-form-item>
      <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
      <el-form-item label="初始密码"><el-input v-model="form.password" /></el-form-item>
      <el-form-item label="角色">
        <el-select v-model="form.role" style="width:100%">
          <el-option label="评级专家" value="expert" />
          <el-option label="科室负责人" value="dept_head" />
          <el-option label="院领导" value="leader" />
          <el-option label="管理员" value="admin" />
        </el-select>
      </el-form-item>
      <el-form-item label="科室">
        <el-select v-model="form.dept_id" clearable style="width:100%" placeholder="可选">
          <el-option v-for="d in depts" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog = false">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</div>
`,
})
