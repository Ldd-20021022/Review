import { defineComponent, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from '/src/shim/element-plus.js'
import { getStandards } from '../../api/hospital-rating.js'
import { createCategory, createIndicator, importExcel } from '../../api/standards.js'

export default defineComponent({
  name: 'HRStandardManage',
  setup() {
    const categories = ref([])
    const loading = ref(false)
    const uploading = ref(false)

    // Category dialog
    const catDialog = ref(false)
    const catForm = ref({ name: '', code: '', weight: 0, sort_order: 0 })

    // Indicator dialog
    const indDialog = ref(false)
    const indForm = ref({
      category_id: 0, name: '', code: '',
      standard_value: '', unit: '%', indicator_type: 'numeric_less_equal',
      weight: 0, max_score: 100,
    })

    // Text import
    const textDialog = ref(false)
    const textInput = ref('')
    const textImporting = ref(false)

    const typeOptions = [
      { value: 'numeric_less_equal', label: '≤ 标准值 (越小越好)' },
      { value: 'numeric_greater_equal', label: '≥ 标准值 (越大越好)' },
      { value: 'numeric_equal', label: '= 标准值 (精确匹配)' },
      { value: 'numeric_range', label: '区间 (如 0.5%-1.5%)' },
      { value: 'yesno', label: '是/否判断' },
    ]

    async function fetch() {
      loading.value = true
      try { categories.value = await getStandards() || [] }
      finally { loading.value = false }
    }

    // ── Category CRUD ──
    function openCatDialog() {
      catForm.value = { name: '', code: '', weight: 0, sort_order: 0 }
      catDialog.value = true
    }

    async function handleCreateCat() {
      if (!catForm.value.name || !catForm.value.code) {
        ElMessage.warning('请填写分类名称和编码')
        return
      }
      try {
        await createCategory({ ...catForm.value, weight: Number(catForm.value.weight), sort_order: Number(catForm.value.sort_order) })
        ElMessage.success('分类已创建')
        catDialog.value = false
        await fetch()
      } catch (e) { ElMessage.error('创建失败: ' + e.message) }
    }

    // ── Indicator CRUD ──
    function openIndDialog(catId) {
      indForm.value = {
        category_id: catId, name: '', code: '',
        standard_value: '', unit: '%', indicator_type: 'numeric_less_equal',
        weight: 0, max_score: 100,
      }
      indDialog.value = true
    }

    async function handleCreateInd() {
      if (!indForm.value.name || !indForm.value.code) {
        ElMessage.warning('请填写指标名称和编码')
        return
      }
      try {
        await createIndicator({
          ...indForm.value,
          weight: Number(indForm.value.weight),
          max_score: Number(indForm.value.max_score),
          category_id: Number(indForm.value.category_id),
        })
        ElMessage.success('指标已创建')
        indDialog.value = false
        await fetch()
      } catch (e) { ElMessage.error('创建失败: ' + e.message) }
    }

    // ── Excel import ──
    function handleFileChange(e) {
      const file = e.target.files?.[0]
      if (!file) return
      uploading.value = true
      importExcel(file).then(res => {
        ElMessage.success(`导入完成: ${res.count || 0} 条`)
        fetch()
      }).catch(err => {
        ElMessage.error('导入失败: ' + (err.message || err))
      }).finally(() => { uploading.value = false })
      e.target.value = ''
    }

    // ── Text/Word import ──
    function openTextImport() {
      textInput.value = ''
      textDialog.value = true
    }

    async function handleTextImport() {
      const lines = textInput.value.trim().split('\n').filter(Boolean)
      if (lines.length < 2) {
        ElMessage.warning('请按格式粘贴数据：第一行为分类名，后续行为指标（名称,编码,标准值,类型,权重）')
        return
      }
      textImporting.value = true
      let catId = 0
      let count = 0
      try {
        for (const line of lines) {
          // Category: starts with # or line without comma
          if (line.startsWith('#') || (!line.includes(',') && catId === 0)) {
            const name = line.replace('#', '').trim()
            if (name) {
              const cat = await createCategory({ name, code: name.substring(0, 4), weight: 0, sort_order: 0 })
              catId = cat.id
            }
            continue
          }
          // Indicator: name,code,standard_value,indicator_type,weight
          const parts = line.split(',').map(s => s.trim())
          if (parts.length >= 3 && catId > 0) {
            await createIndicator({
              category_id: catId,
              name: parts[0],
              code: parts[1] || `IND${Date.now()}`,
              standard_value: parts[2] || '',
              indicator_type: parts[3] || 'numeric_less_equal',
              weight: Number(parts[4]) || 0,
              max_score: 100,
            })
            count++
          }
        }
        ElMessage.success(`文本导入完成: ${count} 条指标`)
        textDialog.value = false
        await fetch()
      } catch (e) { ElMessage.error('导入失败: ' + e.message) }
      finally { textImporting.value = false }
    }

    onMounted(fetch)

    return {
      categories, loading, uploading, catDialog, catForm, indDialog, indForm,
      textDialog, textInput, textImporting, typeOptions,
      openCatDialog, handleCreateCat, openIndDialog, handleCreateInd,
      handleFileChange, openTextImport, handleTextImport,
    }
  },
  template: `
<div v-loading="loading">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2>📐 三甲评审标准库</h2>
    <div style="display:flex;gap:8px">
      <label style="cursor:pointer">
        <el-button type="primary" :loading="uploading">
          📤 Excel 导入
        </el-button>
        <input type="file" accept=".xlsx,.xls" style="display:none" @change="handleFileChange" />
      </label>
      <el-button @click="openTextImport">📝 文本/Word 导入</el-button>
      <el-button @click="openCatDialog">➕ 添加分类</el-button>
    </div>
  </div>

  <el-card v-if="categories.length === 0">
    <div style="text-align:center;padding:40px;color:#909399">
      <p style="font-size:48px;margin:0">📐</p>
      <p>标准库为空，请通过 Excel 导入或手动添加评审指标</p>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center">
        <label style="cursor:pointer">
          <el-button type="primary">📤 Excel 导入</el-button>
          <input type="file" accept=".xlsx,.xls" style="display:none" @change="handleFileChange" />
        </label>
        <el-button @click="openTextImport">📝 文本/Word 导入</el-button>
      </div>
    </div>
  </el-card>

  <el-collapse v-else>
    <el-collapse-item v-for="cat in categories" :key="cat.id" :name="String(cat.id)">
      <template #title>
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
          <span>
            <span style="font-weight:600">{{ cat.name }}</span>
            <span style="color:#909399;font-size:12px;margin-left:8px">
              {{ cat.indicators?.length || 0 }} 项 · 权重 {{ cat.weight }}%
            </span>
          </span>
          <el-button size="small" @click.stop="openIndDialog(cat.id)">➕ 添加指标</el-button>
        </div>
      </template>
      <el-table :data="cat.indicators || []" stripe size="small">
        <el-table-column prop="code" label="编号" width="80" />
        <el-table-column prop="name" label="指标名称" min-width="200" />
        <el-table-column prop="standard_value" label="标准值" width="120" align="center" />
        <el-table-column label="类型" width="120" align="center">
          <template #default="{ row }">
            <el-tag size="small">{{ row.indicator_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="weight" label="权重" width="70" align="center" />
        <el-table-column prop="max_score" label="满分" width="70" align="center" />
      </el-table>
    </el-collapse-item>
  </el-collapse>

  <!-- Category dialog -->
  <el-dialog v-model="catDialog" title="➕ 添加指标分类" width="480px">
    <el-form :model="catForm" label-width="80px">
      <el-form-item label="分类名称" required>
        <el-input v-model="catForm.name" placeholder="如：医疗质量与安全" />
      </el-form-item>
      <el-form-item label="编码" required>
        <el-input v-model="catForm.code" placeholder="如：MED" />
      </el-form-item>
      <el-form-item label="权重(%)">
        <el-input-number v-model="catForm.weight" :min="0" :max="100" />
      </el-form-item>
      <el-form-item label="排序">
        <el-input-number v-model="catForm.sort_order" :min="0" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="catDialog = false">取消</el-button>
      <el-button type="primary" @click="handleCreateCat">创建</el-button>
    </template>
  </el-dialog>

  <!-- Indicator dialog -->
  <el-dialog v-model="indDialog" title="➕ 添加评审指标" width="520px">
    <el-form :model="indForm" label-width="80px">
      <el-form-item label="指标名称" required>
        <el-input v-model="indForm.name" placeholder="如：住院患者死亡率" />
      </el-form-item>
      <el-form-item label="编码" required>
        <el-input v-model="indForm.code" placeholder="如：IND01" />
      </el-form-item>
      <el-form-item label="标准值">
        <el-input v-model="indForm.standard_value" placeholder="如：≤0.8%" />
      </el-form-item>
      <el-form-item label="单位">
        <el-input v-model="indForm.unit" placeholder="如：%" style="width:120px" />
      </el-form-item>
      <el-form-item label="判定类型">
        <el-select v-model="indForm.indicator_type" style="width:100%">
          <el-option v-for="o in typeOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="权重">
        <el-input-number v-model="indForm.weight" :min="0" :max="100" />
      </el-form-item>
      <el-form-item label="满分">
        <el-input-number v-model="indForm.max_score" :min="0" :max="100" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="indDialog = false">取消</el-button>
      <el-button type="primary" @click="handleCreateInd">创建</el-button>
    </template>
  </el-dialog>

  <!-- Text import dialog -->
  <el-dialog v-model="textDialog" title="📝 文本/Word 批量导入" width="600px">
    <p style="color:#909399;font-size:13px;margin-bottom:12px">
      每行一个指标，格式：<code>指标名称,编码,标准值,判定类型,权重</code><br/>
      以 <code>#</code> 开头的行作为新分类。从 Word 粘贴时，直接复制表格内容即可。
    </p>
    <el-input v-model="textInput" type="textarea" :rows="12"
      placeholder="示例：&#10;#医疗质量与安全&#10;住院患者死亡率,IND01,≤0.8%,numeric_less_equal,40&#10;手术并发症发生率,IND02,≤2%,numeric_less_equal,30" />
    <template #footer>
      <el-button @click="textDialog = false">取消</el-button>
      <el-button type="primary" @click="handleTextImport" :loading="textImporting">导入</el-button>
    </template>
  </el-dialog>
</div>
`,
})
