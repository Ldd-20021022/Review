import { defineComponent, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'

export default defineComponent({
  name: 'LoginPage',
  setup() {
    const router = useRouter()
    const auth = useAuthStore()
    const form = ref({ phone: '', password: '' })
    const loading = ref(false)
    const error = ref('')

    async function handleLogin() {
      loading.value = true
      error.value = ''
      try {
        await auth.loginAction(form.value.phone, form.value.password)
        router.push('/')
      } catch (e) {
        error.value = e.message || '登录失败'
      } finally {
        loading.value = false
      }
    }

    return { form, loading, error, handleLogin }
  },
  template: `
<div class="login-page">
  <div class="login-card">
    <h2>EMR 评级自评系统</h2>
    <p class="subtitle">电子病历系统评级差距自评与整改平台</p>
    <el-form @submit.prevent="handleLogin" label-width="0">
      <el-form-item>
        <el-input v-model="form.phone" placeholder="手机号" size="large" />
      </el-form-item>
      <el-form-item>
        <el-input v-model="form.password" type="password" placeholder="密码" size="large" show-password />
      </el-form-item>
      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" style="margin-bottom:16px" />
      <el-form-item>
        <el-button type="primary" size="large" :loading="loading" native-type="submit" style="width:100%">
          登 录
        </el-button>
      </el-form-item>
    </el-form>
  </div>
</div>
`,
})
