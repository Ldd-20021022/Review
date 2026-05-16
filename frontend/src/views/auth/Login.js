import { defineComponent, ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import { post } from '../../api/client.js'

const slides = [
  { title: '三甲医院评审', subtitle: '科学 · 规范 · 精准', color: '#1a5276' },
  { title: '医疗质量提升', subtitle: '以评促建 · 以评促改', color: '#1e8449' },
  { title: '数据驱动决策', subtitle: '全院数据一目了然', color: '#7d3c98' },
]

export default defineComponent({
  name: 'LoginPage',
  setup() {
    const router = useRouter()
    const auth = useAuthStore()
    const isLogin = ref(true)
    const form = ref({ phone: '', password: '' })
    const loading = ref(false)
    const error = ref('')
    const slideIdx = ref(0)
    let timer = null

    timer = setInterval(() => {
      slideIdx.value = (slideIdx.value + 1) % slides.length
    }, 4000)
    onUnmounted(() => clearInterval(timer))

    const currentSlide = computed(() => slides[slideIdx.value])

    function slideStyle(s, i) {
      const opacity = slideIdx.value === i ? 1 : 0
      return {
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, ' + s.color + ', ' + s.color + 'dd)',
        opacity: opacity,
        transition: 'opacity 1s ease-in-out',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }
    }

    function dotStyle(i) {
      return {
        width: slideIdx.value === i ? '24px' : '8px', height: '8px',
        borderRadius: '4px',
        background: slideIdx.value === i ? '#fff' : 'rgba(255,255,255,.4)',
        cursor: 'pointer', transition: 'all .3s',
      }
    }

    function tabStyle(active) {
      return {
        flex: 1, textAlign: 'center', padding: '10px 0', cursor: 'pointer',
        fontSize: '15px', fontWeight: active ? 600 : 400,
        color: active ? '#3b82f6' : '#94a3b8',
        borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
        marginBottom: '-2px', transition: 'all .2s',
      }
    }

    const type = computed(() => isLogin.value ? '登录' : '注册')

    async function handleSubmit() {
      if (!form.value.phone || !form.value.password) {
        error.value = '请填写手机号和密码'
        return
      }
      loading.value = true
      error.value = ''
      try {
        if (isLogin.value) {
          await auth.loginAction(form.value.phone, form.value.password)
          router.push('/')
        } else {
          await post('/api/auth/register', { phone: form.value.phone, password: form.value.password })
          error.value = ''
          isLogin.value = true
          form.value.password = ''
        }
      } catch (e) {
        error.value = e.message || `${type.value}失败`
      } finally {
        loading.value = false
      }
    }

    return { isLogin, form, loading, error, slideIdx, slides, currentSlide, type,
      slideStyle, dotStyle, tabStyle, handleSubmit }
  },
  template: `
<div style="display:flex;height:100vh;width:100vw;overflow:hidden">
  <!-- Left: Carousel -->
  <div style="flex:1;position:relative;overflow:hidden;min-width:0">
    <div v-for="(s, i) in slides" :key="i" :style="slideStyle(s, i)">
      <div style="font-size:72px;margin-bottom:16px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.2))">🏥</div>
      <h1 style="color:#fff;font-size:32px;font-weight:700;margin:0 0 8px;text-shadow:0 2px 4px rgba(0,0,0,.2)">{{ s.title }}</h1>
      <p style="color:rgba(255,255,255,.85);font-size:16px;margin:0">{{ s.subtitle }}</p>
    </div>
    <div style="position:absolute;bottom:32px;left:50%;transform:translateX(-50%);display:flex;gap:8px">
      <div v-for="(s, i) in slides" :key="'d'+i" @click="slideIdx = i" :style="dotStyle(i)" />
    </div>
  </div>

  <!-- Right: Form -->
  <div style="width:460px;display:flex;align-items:center;justify-content:center;background:#fff;padding:40px;flex-shrink:0">
    <div style="width:100%;max-width:360px">
      <div style="text-align:center;margin-bottom:32px">
        <div style="font-size:40px;margin-bottom:8px">🏥</div>
        <h2 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#1e293b">三甲医院评级系统</h2>
        <p style="margin:0;color:#94a3b8;font-size:13px">科学评审 · 持续改进</p>
      </div>

      <div style="display:flex;margin-bottom:24px;border-bottom:2px solid #e2e8f0">
        <div @click="isLogin = true; error = ''" :style="tabStyle(isLogin)">登 录</div>
        <div @click="isLogin = false; error = ''" :style="tabStyle(!isLogin)">注 册</div>
      </div>

      <el-form @submit.prevent="handleSubmit" label-width="0">
        <el-form-item>
          <el-input v-model="form.phone" placeholder="手机号 / 账号" size="large" clearable />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="密码" size="large" show-password />
        </el-form-item>
        <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" style="margin-bottom:16px" />
        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" native-type="submit" style="width:100%">
            {{ isLogin ? '登 录' : '注 册' }}
          </el-button>
        </el-form-item>
      </el-form>

      <p v-if="isLogin" style="text-align:center;color:#94a3b8;font-size:13px;margin-top:16px">
        还没有账号？<span @click="isLogin = false; error = ''" style="color:#3b82f6;cursor:pointer">立即注册</span>
      </p>
      <p v-else style="text-align:center;color:#94a3b8;font-size:13px;margin-top:16px">
        已有账号？<span @click="isLogin = true; error = ''" style="color:#3b82f6;cursor:pointer">返回登录</span>
      </p>
    </div>
  </div>
</div>
`,
})
