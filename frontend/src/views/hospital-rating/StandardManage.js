import { defineComponent, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from '/src/shim/element-plus.js'
import { getStandards } from '../../api/hospital-rating.js'
import { createCategory, updateCategory, deleteCategory, createIndicator, updateIndicator, deleteIndicator, importExcel } from '../../api/standards.js'
import { checkCompliance, calcScore, _extractNumber } from '../../utils/compliance.js'
import { BASE_URL } from '../../api/client.js'

export default defineComponent({
  name: 'HRStandardManage',
  setup() {
    const categories = ref([])
    const loading = ref(false)
    const uploading = ref(false)
    const searchText = ref('')

    // Category dialog
    const catDialog = ref(false)
    const catForm = ref({ name: '', code: '', weight: 0, sort_order: 0 })
    const editingCat = ref(null)

    // Indicator dialog
    const indDialog = ref(false)
    const indForm = ref({
      category_id: 0, name: '', code: '',
      standard_value: '', unit: '%', indicator_type: 'numeric_less_equal',
      weight: 0, max_score: 100,
    })
    const editingInd = ref(null)

    // Text import
    const textDialog = ref(false)
    const textInput = ref('')
    const textImporting = ref(false)

    // Compliance tester
    const testerVal = ref('')
    const testerStd = ref('≤0.8%')
    const testerType = ref('numeric_less_equal')
    const testerResult = ref(null)

    // ── Helpers ──
    function filterIndicators(indicators) {
      if (!searchText.value) return indicators || []
      const q = searchText.value.toLowerCase()
      return (indicators || []).filter(ind =>
        (ind.name || '').toLowerCase().includes(q) ||
        (ind.code || '').toLowerCase().includes(q)
      )
    }

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
    function openCatDialog(cat = null) {
      editingCat.value = cat
      catForm.value = cat ? { name: cat.name, code: cat.code, weight: cat.weight || 0, sort_order: cat.sort_order || 0 } : { name: '', code: '', weight: 0, sort_order: 0 }
      catDialog.value = true
    }

    async function saveCat() {
      if (!catForm.value.name || !catForm.value.code) { ElMessage.warning('请填写分类名称和编码'); return }
      try {
        if (editingCat.value) {
          await updateCategory(editingCat.value.id, { ...catForm.value, weight: Number(catForm.value.weight), sort_order: Number(catForm.value.sort_order) })
          ElMessage.success('分类已更新')
        } else {
          await createCategory({ ...catForm.value, weight: Number(catForm.value.weight), sort_order: Number(catForm.value.sort_order) })
          ElMessage.success('分类已创建')
        }
        catDialog.value = false
        await fetch()
      } catch (e) { ElMessage.error('操作失败: ' + (e.message || '')) }
    }

    async function removeCat(cat) {
      try {
        await ElMessageBox.confirm(`删除分类【${cat.name}】及其下所有指标？`, '警告', { type: 'warning', confirmButtonText: '确认删除' })
        await deleteCategory(cat.id)
        ElMessage.success('已删除')
        await fetch()
      } catch (_) { /* cancelled */ }
    }

    // ── Indicator CRUD ──
    function openIndDialog(catId, ind = null) {
      editingInd.value = ind
      indForm.value = ind ? {
        category_id: ind.category_id, name: ind.name, code: ind.code,
        standard_value: ind.standard_value || '', unit: ind.unit || '%',
        indicator_type: ind.indicator_type || 'numeric_less_equal',
        weight: ind.weight || 0, max_score: ind.max_score || 100,
      } : {
        category_id: catId, name: '', code: '',
        standard_value: '', unit: '%', indicator_type: 'numeric_less_equal',
        weight: 0, max_score: 100,
      }
      indDialog.value = true
    }

    async function saveInd() {
      if (!indForm.value.name || !indForm.value.code) { ElMessage.warning('请填写指标名称和编码'); return }
      const payload = {
        ...indForm.value,
        weight: Number(indForm.value.weight),
        max_score: Number(indForm.value.max_score),
        category_id: Number(indForm.value.category_id),
        sort_order: 0, requirements: [],
      }
      try {
        if (editingInd.value) {
          await updateIndicator(editingInd.value.id, payload)
          ElMessage.success('指标已更新')
        } else {
          await createIndicator(payload)
          ElMessage.success('指标已创建')
        }
        indDialog.value = false
        await fetch()
      } catch (e) { ElMessage.error('操作失败: ' + (e.message || '')) }
    }

    async function removeInd(ind) {
      try {
        await ElMessageBox.confirm(`删除指标【${ind.name}(${ind.code})】？`, '警告', { type: 'warning', confirmButtonText: '确认删除' })
        await deleteIndicator(ind.id)
        ElMessage.success('已删除')
        await fetch()
      } catch (_) { /* cancelled */ }
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

    // ── Text import ──
    function openTextImport() { textInput.value = ''; textDialog.value = true }

    async function handleTextImport() {
      const lines = textInput.value.trim().split('\n').filter(Boolean)
      if (lines.length < 2) { ElMessage.warning('请按格式粘贴数据'); return }
      textImporting.value = true
      let catId = 0; let count = 0
      try {
        for (const line of lines) {
          if (line.startsWith('#') || (!line.includes(',') && catId === 0)) {
            const name = line.replace('#', '').trim()
            if (name) {
              const cat = await createCategory({ name, code: name.substring(0, 4), weight: 0, sort_order: 0 })
              catId = cat.id
            }
            continue
          }
          const parts = line.split(',').map(s => s.trim())
          if (parts.length >= 3 && catId > 0) {
            await createIndicator({
              category_id: catId, name: parts[0], code: parts[1] || `IND${Date.now()}`,
              standard_value: parts[2] || '', indicator_type: parts[3] || 'numeric_less_equal',
              weight: Number(parts[4]) || 0, max_score: 100, sort_order: 0, requirements: [],
            })
            count++
          }
        }
        ElMessage.success(`文本导入完成: ${count} 条指标`)
        textDialog.value = false
        await fetch()
      } catch (e) { ElMessage.error('导入失败: ' + (e.message || '')) }
      finally { textImporting.value = false }
    }

    // ── Compliance tester ──
    function runTester() {
      const compliant = checkCompliance(testerVal.value, testerStd.value, testerType.value)
      const score = calcScore(testerVal.value, testerStd.value, testerType.value)
      let extracted = null
      try { extracted = _extractNumber(testerVal.value) } catch (_) {}
      testerResult.value = {
        compliant, score,
        extracted: isNaN(extracted) ? null : extracted,
        stdExtracted: (() => { try { return _extractNumber(testerStd.value) } catch (_) { return null } })(),
      }
    }

    const route = useRoute()

    onMounted(() => {
      const q = route.query.search
      if (q) searchText.value = q
      fetch()
    })

    return {
      categories, loading, uploading, catDialog, catForm, editingCat, indDialog, indForm, editingInd,
      textDialog, textInput, textImporting, typeOptions, searchText,
      openCatDialog, saveCat, removeCat, openIndDialog, saveInd, removeInd,
      handleFileChange, openTextImport, handleTextImport, filterIndicators,
      testerVal, testerStd, testerType, testerResult, runTester, BASE_URL,
    }
  },
  template: `
<div v-loading="loading">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2>📐 三甲评审标准库</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <el-input v-model="searchText" placeholder="搜索指标名称/编码..." size="small" style="width:200px" clearable />
      <label style="cursor:pointer;margin:0">
        <el-button type="primary" :loading="uploading">📤 Excel 导入</el-button>
        <input type="file" accept=".xlsx,.xls" style="display:none" @change="handleFileChange" />
      </label>
      <el-button @click="openTextImport">📝 文本导入</el-button>
      <a :href="BASE_URL + '/api/standards/template'" target="_blank" style="text-decoration:none">
        <el-button>📥 模板</el-button>
      </a>
      <el-button type="success" @click="openCatDialog()">➕ 添加分类</el-button>
    </div>
  </div>

  <!-- Compliance Tester -->
  <el-card style="margin-bottom:16px;background:#f8fafc">
    <template #header>
      <span style="font-weight:bold">🔬 达标判定测试器</span>
      <span style="font-size:12px;color:#94a3b8;margin-left:8px">模拟指标填报，验证判定结果</span>
    </template>
    <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
      <div style="flex:1;min-width:140px">
        <div style="font-size:12px;color:#64748b;margin-bottom:4px">标准值</div>
        <el-input v-model="testerStd" size="small" placeholder="如: ≤0.8%" />
      </div>
      <div style="flex:1;min-width:140px">
        <div style="font-size:12px;color:#64748b;margin-bottom:4px">实际填入值</div>
        <el-input v-model="testerVal" size="small" placeholder="如: 1.2%" @keyup.enter="runTester" />
      </div>
      <div style="width:180px">
        <div style="font-size:12px;color:#64748b;margin-bottom:4px">判定类型</div>
        <el-select v-model="testerType" size="small" style="width:100%">
          <el-option v-for="o in typeOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </div>
      <el-button type="primary" size="small" @click="runTester">🔍 测试</el-button>
      <div v-if="testerResult" style="display:flex;gap:16px;align-items:center;margin-left:8px">
        <span style="font-size:20px">{{ testerResult.compliant ? '✅ 达标' : testerResult.compliant === false ? '❌ 未达标' : '⚠️ 无法判定' }}</span>
        <span style="font-weight:700;font-size:18px" :style="{color: testerResult.score >= 60 ? '#67c23a' : '#f56c6c'}">{{ testerResult.score }} 分</span>
        <span v-if="testerResult.extracted !== null" style="font-size:11px;color:#94a3b8">
          提取值: {{ testerResult.extracted }} (标准: {{ testerResult.stdExtracted }})
        </span>
      </div>
    </div>
  </el-card>

  <!-- Standards List -->
  <el-card v-if="categories.length === 0">
    <div style="text-align:center;padding:60px;color:#909399">
      <p style="font-size:48px;margin:0">📐</p>
      <p>标准库为空，请通过 Excel 导入或手动添加评审指标</p>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center">
        <label style="cursor:pointer">
          <el-button type="primary">📤 Excel 导入</el-button>
          <input type="file" accept=".xlsx,.xls" style="display:none" @change="handleFileChange" />
        </label>
        <el-button @click="openTextImport">📝 文本导入</el-button>
      </div>
    </div>
  </el-card>

  <el-collapse v-else>
    <el-collapse-item v-for="cat in categories" :key="cat.id" :name="String(cat.id)">
      <template #title>
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%;padding-right:20px">
          <span>
            <span style="font-weight:600">{{ cat.name }}</span>
            <span style="color:#909399;font-size:12px;margin-left:8px">
              {{ filterIndicators(cat.indicators).length }}/{{ cat.indicators?.length || 0 }} 项 · 权重 {{ cat.weight || 0 }}%
            </span>
          </span>
          <div style="display:flex;gap:4px" @click.stop>
            <el-button size="small" @click="openIndDialog(cat.id)">➕ 添加指标</el-button>
            <el-button size="small" @click="openCatDialog(cat)">✏️ 编辑</el-button>
            <el-button size="small" type="danger" @click="removeCat(cat)">🗑 删除</el-button>
          </div>
        </div>
      </template>
      <el-table :data="filterIndicators(cat.indicators)" stripe size="small">
        <el-table-column prop="code" label="编号" width="80" />
        <el-table-column prop="name" label="指标名称" min-width="180" />
        <el-table-column label="标准值" width="130" align="center">
          <template #default="{ row }">{{ row.standard_value }}{{ row.unit ? ' ' + row.unit : '' }}</template>
        </el-table-column>
        <el-table-column label="类型" width="150" align="center">
          <template #default="{ row }">
            <el-tag size="small">{{ row.indicator_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="weight" label="权重" width="70" align="center" />
        <el-table-column label="操作" width="130" align="center">
          <template #default="{ row }">
            <el-button link size="small" @click="openIndDialog(cat.id, row)">✏️</el-button>
            <el-button link size="small" style="color:#f56c6c" @click="removeInd(row)">🗑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-collapse-item>
  </el-collapse>

  <!-- Category dialog -->
  <el-dialog v-model="catDialog" :title="(editingCat ? '✏️ 编辑' : '➕ 添加') + '指标分类'" width="480px">
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
      <el-button type="primary" @click="saveCat">{{ editingCat ? '更新' : '创建' }}</el-button>
    </template>
  </el-dialog>

  <!-- Indicator dialog -->
  <el-dialog v-model="indDialog" :title="(editingInd ? '✏️ 编辑' : '➕ 添加') + '评审指标'" width="520px">
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
      <el-button type="primary" @click="saveInd">{{ editingInd ? '更新' : '创建' }}</el-button>
    </template>
  </el-dialog>

  <!-- Text import dialog -->
  <el-dialog v-model="textDialog" title="📝 文本/Word 批量导入" width="600px">
    <p style="color:#909399;font-size:13px;margin-bottom:12px">
      每行一个指标，格式：<code>指标名称,编码,标准值,判定类型,权重</code><br/>
      以 <code>#</code> 开头的行作为新分类。
    </p>
    <el-input v-model="textInput" type="textarea" :rows="12"
      placeholder="示例：&#10;#医疗质量与安全&#10;住院患者死亡率,IND01,≤0.8%,numeric_less_equal,5&#10;手术并发症发生率,IND02,≤2%,numeric_less_equal,5" />
    <template #footer>
      <el-button @click="textDialog = false">取消</el-button>
      <el-button type="primary" @click="handleTextImport" :loading="textImporting">导入</el-button>
    </template>
  </el-dialog>
</div>
`,
})
