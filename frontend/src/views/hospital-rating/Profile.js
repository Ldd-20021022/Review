import { defineComponent, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from '/src/shim/element-plus.js'
import { useAuthStore } from '../../stores/auth.js'
import { post } from '../../api/client.js'

const roleLabels = {
  admin: '管理员', director: '院长', expert: '评级专家',
  dept_head: '科室负责人', leader: '院领导',
}

export default defineComponent({
  name: 'HRProfile',
  setup() {
    const router = useRouter()
    const auth = useAuthStore()
    const pwdForm = ref({ old: '', new1: '', new2: '' })
    const changing = ref(false)

    const roleLabel = computed(() => roleLabels[auth.user?.role] || auth.user?.role || '')

    async function changePassword() {
      if (!pwdForm.value.old || !pwdForm.value.new1) {
        ElMessage.warning('请填写完整')
        return
      }
      if (pwdForm.value.new1 !== pwdForm.value.new2) {
        ElMessage.warning('两次新密码不一致')
        return
      }
      changing.value = true
      try {
        await post('/api/auth/change-password', {
          old_password: pwdForm.value.old,
          new_password: pwdForm.value.new1,
        })
        ElMessage.success('密码修改成功，请重新登录')
        pwdForm.value = { old: '', new1: '', new2: '' }
        setTimeout(() => { auth.logout(); router.push('/login') }, 1000)
      } catch (e) {
        ElMessage.error(e.message || '修改失败')
      } finally { changing.value = false }
    }

    return { auth, pwdForm, changing, roleLabel, changePassword }
  },
  template: `
<div style="max-width:600px">
  <h2 style="margin-bottom:20px">👤 个人中心</h2>

  <el-card style="margin-bottom:16px">
    <template #header><span style="font-weight:bold">基本信息</span></template>
    <el-form label-width="80px" label-position="left">
      <el-form-item label="姓名"><strong>{{ auth.user?.name || '-' }}</strong></el-form-item>
      <el-form-item label="手机号">{{ auth.user?.phone || '-' }}</el-form-item>
      <el-form-item label="角色"><el-tag size="small">{{ roleLabel }}</el-tag></el-form-item>
    </el-form>
  </el-card>

  <el-card>
    <template #header><span style="font-weight:bold">修改密码</span></template>
    <el-form label-width="100px" label-position="left">
      <el-form-item label="当前密码">
        <el-input v-model="pwdForm.old" type="password" show-password placeholder="输入当前密码" />
      </el-form-item>
      <el-form-item label="新密码">
        <el-input v-model="pwdForm.new1" type="password" show-password placeholder="输入新密码" />
      </el-form-item>
      <el-form-item label="确认新密码">
        <el-input v-model="pwdForm.new2" type="password" show-password placeholder="再次输入新密码" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="changePassword" :loading="changing">修改密码</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</div>
`,
})
