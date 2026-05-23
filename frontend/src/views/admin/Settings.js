import { defineComponent, ref, onMounted } from 'vue'
import { ElMessage } from '/src/shim/element-plus.js'
import { get, put } from '../../api/client.js'

export default defineComponent({
  name: 'SystemSettings',
  setup() {
    const systemInfo = ref(null)
    const tenant = ref(null)
    const loading = ref(false)
    const saving = ref(false)
    const tenantForm = ref({ name: '', contact: '' })

    async function fetchSystemInfo() {
      try { systemInfo.value = await get('/api/system/info') }
      catch { systemInfo.value = null }
    }

    async function fetchTenant() {
      try {
        const list = await get('/api/tenants')
        if (list && list.length > 0) {
          tenant.value = list[0]
          tenantForm.value = { name: tenant.value.name, contact: tenant.value.contact || '' }
        }
      } catch { tenant.value = null }
    }

    async function saveTenant() {
      if (!tenant.value) return
      saving.value = true
      try {
        await put('/api/tenants/' + tenant.value.id, tenantForm.value)
        ElMessage.success('医院信息已更新')
        await fetchTenant()
      } catch (e) { ElMessage.error('保存失败: ' + (e.message || '')) }
      finally { saving.value = false }
    }

    onMounted(() => { loading.value = true; Promise.all([fetchSystemInfo(), fetchTenant()]).finally(() => { loading.value = false }) })

    return { systemInfo, tenant, tenantForm, loading, saving, saveTenant }
  },
  template: `
<div v-loading="loading">
  <h2 style="margin-bottom:20px">⚙️ 系统设置</h2>

  <el-row :gutter="16">
    <el-col :span="14">
      <!-- Hospital Profile -->
      <el-card style="margin-bottom:16px">
        <template #header><span style="font-weight:bold">🏥 医院信息</span></template>
        <el-form v-if="tenant" :model="tenantForm" label-width="100px" label-position="left">
          <el-form-item label="医院名称">
            <el-input v-model="tenantForm.name" placeholder="医院名称" />
          </el-form-item>
          <el-form-item label="联系方式">
            <el-input v-model="tenantForm.contact" placeholder="电话或地址" />
          </el-form-item>
          <el-form-item label="状态">
            <el-tag :type="tenant.status === 'active' ? 'success' : 'info'" size="small">{{ tenant.status }}</el-tag>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveTenant" :loading="saving">保存修改</el-button>
          </el-form-item>
        </el-form>
        <div v-else style="text-align:center;padding:20px;color:#94a3b8">暂无租户数据</div>
      </el-card>
    </el-col>

    <el-col :span="10">
      <!-- System Status -->
      <el-card style="margin-bottom:16px">
        <template #header><span style="font-weight:bold">🖥 系统状态</span></template>
        <div v-if="systemInfo" style="font-size:13px;line-height:2">
          <div style="display:flex;justify-content:space-between">
            <span>应用名称</span><span style="color:#64748b">{{ systemInfo.app_name }}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span>数据库</span>
            <span :style="{color: systemInfo.db_connected ? '#67c23a' : '#f56c6c'}">
              {{ systemInfo.db_connected ? '✅ 已连接' : '❌ 未连接' }} ({{ systemInfo.database_type }})
            </span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span>JWT 算法</span><span style="color:#64748b">{{ systemInfo.jwt_algorithm }} · {{ systemInfo.jwt_expire_minutes }}分钟过期</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span>邮件服务</span>
            <span :style="{color: systemInfo.smtp_configured ? '#67c23a' : '#e6a23c'}">
              {{ systemInfo.smtp_configured ? '✅ 已配置' : '⚠️ 未配置' }}
            </span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span>DeepSeek AI</span>
            <span :style="{color: systemInfo.deepseek_configured ? '#67c23a' : '#e6a23c'}">
              {{ systemInfo.deepseek_configured ? '✅ 已连接' : '⚠️ 未配置' }}
            </span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span>AI 模型</span><span style="color:#64748b">{{ systemInfo.deepseek_model }}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span>限流</span>
            <span :style="{color: systemInfo.rate_limit_enabled ? '#67c23a' : '#94a3b8'}">
              {{ systemInfo.rate_limit_enabled ? '✅ 已启用' : '关闭' }}
            </span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span>调试模式</span>
            <span :style="{color: systemInfo.debug ? '#e6a23c' : '#94a3b8'}">{{ systemInfo.debug ? 'ON' : 'OFF' }}</span>
          </div>
        </div>
      </el-card>

      <!-- Data Stats -->
      <el-card>
        <template #header><span style="font-weight:bold">📊 数据统计</span></template>
        <div v-if="systemInfo?.counts" style="font-size:13px;line-height:2">
          <div style="display:flex;justify-content:space-between">
            <span>医院数</span><span style="font-weight:600">{{ systemInfo.counts.tenants }}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span>用户数</span><span style="font-weight:600">{{ systemInfo.counts.users }}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span>当前医院评估数</span><span style="font-weight:600">{{ systemInfo.counts.assessments }}</span>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>
</div>
`,
})
