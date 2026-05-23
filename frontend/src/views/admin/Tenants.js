import { defineComponent, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from '/src/shim/element-plus.js'
import { get, post, put, del } from '../../api/client.js'

export default defineComponent({
  name: 'TenantsManagement',
  setup() {
    const tenants = ref([])
    const loading = ref(false)
    const dialog = ref(false)
    const form = ref({ name: '', contact: '' })
    const editing = ref(null)

    async function fetch() {
      loading.value = true
      try { tenants.value = await get('/api/tenants') || [] }
      catch { tenants.value = [] }
      finally { loading.value = false }
    }

    function open(t = null) {
      editing.value = t
      form.value = t ? { name: t.name, contact: t.contact || '' } : { name: '', contact: '' }
      dialog.value = true
    }

    async function save() {
      if (!form.value.name) { ElMessage.warning('请填写医院名称'); return }
      try {
        if (editing.value) {
          await put('/api/tenants/' + editing.value.id, form.value)
          ElMessage.success('已更新')
        } else {
          await post('/api/tenants', form.value)
          ElMessage.success('已创建')
        }
        dialog.value = false
        await fetch()
      } catch (e) { ElMessage.error('操作失败: ' + (e.message || '')) }
    }

    async function remove(t) {
      try {
        await ElMessageBox.confirm(`确认删除【${t.name}】？此操作不可恢复。`, '警告', { type: 'warning', confirmButtonText: '确认删除' })
        await del('/api/tenants/' + t.id)
        ElMessage.success('已删除')
        await fetch()
      } catch (_) { /* cancelled */ }
    }

    onMounted(fetch)

    return { tenants, loading, dialog, form, editing, open, save, remove }
  },
  template: `
<div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2>🏥 医院（租户）管理</h2>
    <el-button type="primary" @click="open()">➕ 添加医院</el-button>
  </div>

  <el-card v-loading="loading">
    <div v-if="tenants.length === 0" style="text-align:center;padding:40px;color:#909399">暂无医院数据</div>
    <el-table v-else :data="tenants" stripe size="small">
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="医院名称" min-width="180" />
      <el-table-column prop="contact" label="联系方式" width="160">
        <template #default="{ row }">{{ row.contact || '-' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" align="center">
        <template #default="{ row }">
          <el-button link size="small" @click="open(row)">✏️ 编辑</el-button>
          <el-button link size="small" style="color:#f56c6c" @click="remove(row)">🗑 删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-dialog v-model="dialog" :title="(editing ? '✏️ 编辑' : '➕ 添加') + '医院'" width="480px">
    <el-form :model="form" label-width="80px">
      <el-form-item label="医院名称" required>
        <el-input v-model="form.name" placeholder="如：XX市人民医院" />
      </el-form-item>
      <el-form-item label="联系方式">
        <el-input v-model="form.contact" placeholder="电话或地址" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog = false">取消</el-button>
      <el-button type="primary" @click="save">{{ editing ? '更新' : '创建' }}</el-button>
    </template>
  </el-dialog>
</div>
`,
})
