import { defineComponent, ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from '/src/shim/element-plus.js'
import { getStandards, submitRating, updateRating, getReport } from '../../api/hospital-rating.js'
import { checkCompliance, calcScore } from '../../utils/compliance.js'

const LS_KEY = 'hr_draft'

export default defineComponent({
  name: 'HRRatingForm',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const categories = ref([])
    const formValues = ref({})
    const formRemarks = ref({})
    const activeNames = ref([])
    const submitting = ref(false)
    const saving = ref(false)
    const cycle = ref('2025年度')
    const editId = ref(null)
    const lastSaved = ref('')
    let autoSaveTimer = null

    function saveToLocal() {
      const data = { values: formValues.value, remarks: formRemarks.value, cycle: cycle.value, time: new Date().toISOString() }
      localStorage.setItem(LS_KEY, JSON.stringify(data))
      lastSaved.value = new Date().toLocaleTimeString()
    }

    function loadFromLocal() {
      try {
        const raw = localStorage.getItem(LS_KEY)
        if (!raw) return false
        const data = JSON.parse(raw)
        if (data.values) formValues.value = { ...formValues.value, ...data.values }
        if (data.remarks) formRemarks.value = { ...formRemarks.value, ...data.remarks }
        if (data.cycle) cycle.value = data.cycle
        return true
      } catch (_) { return false }
    }

    function clearLocal() { localStorage.removeItem(LS_KEY); lastSaved.value = '' }
    function hasLocalDraft() { return !!localStorage.getItem(LS_KEY) }

    const cycleOptions = [
      '2024年度','2025年度','2026年度',
      '2024-Q1','2024-Q2','2024-Q3','2024-Q4',
      '2025-Q1','2025-Q2','2025-Q3','2025-Q4',
    ]

    const allIndicators = computed(() => {
      const result = []
      for (const cat of categories.value) {
        if (cat.indicators) {
          for (const ind of cat.indicators) {
            result.push({ ...ind, category_name: cat.name, category_weight: cat.weight })
          }
        }
        if (cat.children) {
          for (const child of cat.children) {
            if (child.indicators) {
              for (const ind of child.indicators) {
                result.push({ ...ind, category_name: child.name, category_weight: child.weight })
              }
            }
          }
        }
      }
      return result
    })

    const fillProgress = computed(() => {
      let filled = 0
      for (const ind of allIndicators.value) {
        if (formValues.value[ind.id] && formValues.value[ind.id] !== '') filled++
      }
      return { filled, total: allIndicators.value.length, pct: allIndicators.value.length > 0 ? Math.round(filled / allIndicators.value.length * 100) : 0 }
    })

    const stats = computed(() => {
      let weighted = 0, totalW = 0, compliant = 0
      for (const ind of allIndicators.value) {
        const val = formValues.value[ind.id]
        if (!val || !ind.standard_value || !ind.indicator_type || !ind.weight) continue
        const score = calcScore(val, ind.standard_value, ind.indicator_type)
        if (score > 0) {
          weighted += score * ind.weight / 100
          totalW += ind.weight
          if (checkCompliance(val, ind.standard_value, ind.indicator_type)) compliant++
        }
      }
      return {
        totalScore: totalW > 0 ? (weighted / totalW * 100).toFixed(1) : '-',
        compliantCount: compliant,
      }
    })

    async function fetchStandards() {
      categories.value = await getStandards() || []
      activeNames.value = categories.value.map(c => String(c.id))
    }

    async function loadEditData(id) {
      try {
        const report = await getReport(id)
        cycle.value = report.rating_cycle || '2025年度'
        editId.value = id
        for (const item of report.items || []) {
          if (item.indicator_id) {
            formValues.value[item.indicator_id] = item.actual_value || ''
            formRemarks.value[item.indicator_id] = item.remark || ''
          }
        }
      } catch (_) { /* ignore */ }
    }

    async function handleSaveDraft() {
      const details = getDetails()
      if (details.length === 0) { ElMessage.warning('请至少填写一项指标数据'); return }
      saving.value = true
      try {
        const payload = { rating_cycle: cycle.value, details, status: 'draft' }
        if (editId.value) {
          // For drafts, just update without changing status
          await updateRating(editId.value, { ...payload, status: 'draft' })
          ElMessage.success('草稿已保存')
          clearLocal()
        } else {
          const res = await submitRating(payload)
          editId.value = res.assessment_id
          clearLocal()
          router.push('/hospital-rating/reports?assessment=' + res.assessment_id)
          ElMessage.success('草稿已保存')
        }
      } catch (e) {
        ElMessage.error('保存失败: ' + e.message)
      } finally { saving.value = false }
    }

    function validateValue(val, ind) {
      if (!val || val === '') return null
      if (ind.indicator_type === 'yesno') return null // any value ok for yesno
      const cleaned = String(val).replace('%', '').trim()
      if (cleaned === '') return null
      if (isNaN(parseFloat(cleaned))) return '请输入有效数字'
      return null
    }

    function getDetails() {
      const details = []
      for (const ind of allIndicators.value) {
        const val = formValues.value[ind.id]
        if (val !== undefined && val !== '') {
          details.push({ indicator_id: ind.id, actual_value: String(val), remark: formRemarks.value[ind.id] || '' })
        }
      }
      return details
    }

    async function handleSubmit() {
      const details = getDetails()
      if (details.length === 0) { ElMessage.warning('请至少填写一项指标数据'); return }
      submitting.value = true
      try {
        const payload = { rating_cycle: cycle.value, details, status: 'submitted' }
        if (editId.value) {
          await updateRating(editId.value, payload)
          ElMessage.success('修改已提交，等待审核')
        } else {
          await submitRating(payload)
          ElMessage.success('提交成功！')
        }
        clearLocal()
        formValues.value = {}
        formRemarks.value = {}
        editId.value = null
        router.push('/hospital-rating/reports')
      } catch (e) {
        ElMessage.error('提交失败: ' + e.message)
      } finally { submitting.value = false }
    }

    onMounted(async () => {
      await fetchStandards()
      const eid = route.query.edit
      if (eid) {
        await loadEditData(Number(eid))
      } else if (!eid && hasLocalDraft()) {
        try {
          await ElMessageBox.confirm('检测到本地草稿，是否恢复？', '恢复草稿', { confirmButtonText: '恢复', cancelButtonText: '放弃' })
          loadFromLocal()
          ElMessage.success('草稿已恢复')
        } catch (_) { clearLocal() }
      }
      autoSaveTimer = setInterval(saveToLocal, 30000)
    })

    onUnmounted(() => { if (autoSaveTimer) clearInterval(autoSaveTimer) })

    return {
      categories, formValues, formRemarks, activeNames, submitting, saving, cycle, cycleOptions, editId,
      allIndicators, stats, fillProgress, lastSaved, checkCompliance, handleSubmit, handleSaveDraft, validateValue,
    }
  },
  template: `
<div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2>{{ editId ? '✏️ 修改评级数据' : '📋 三甲评级数据填报' }}</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <el-select v-model="cycle" style="width:140px" size="small" :disabled="!!editId">
        <el-option v-for="o in cycleOptions" :key="o" :label="o" :value="o" />
      </el-select>
      <el-button @click="handleSaveDraft" :loading="saving">💾 保存草稿</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">
        {{ editId ? '📤 重新提交审核' : '📤 提交审核' }}
      </el-button>
    </div>
  </div>

  <el-alert v-if="editId" title="修改模式：已加载原有数据，修改后点击「重新提交审核」" type="warning" :closable="false" style="margin-bottom:16px" />

  <div v-if="allIndicators.length === 0" style="text-align:center;padding:60px;color:#909399">
    <p style="font-size:48px;margin:0">📐</p>
    <p>暂无评审指标，请先配置标准库</p>
  </div>

  <el-collapse v-model="activeNames" v-else>
    <el-collapse-item v-for="cat in categories" :key="String(cat.id)" :name="String(cat.id)">
      <template #title>
        <span style="font-weight:600;font-size:14px">
          {{ cat.name }}
          <span style="color:#909399;font-weight:400;font-size:12px">(权重 {{ cat.weight }}%)</span>
        </span>
      </template>
      <el-table :data="(cat.indicators || [])" stripe size="small">
        <el-table-column label="指标名称" min-width="180"><template #default="{ row }">{{ row.name }}</template></el-table-column>
        <el-table-column label="标准值" width="120" align="center"><template #default="{ row }">{{ row.standard_value }}{{ row.unit ? ' ' + row.unit : '' }}</template></el-table-column>
        <el-table-column label="实际值" width="160" align="center">
          <template #default="{ row }">
            <el-input v-model="formValues[row.id]" size="small" style="width:120px"
              :placeholder="row.unit || '输入值'"
              :class="{ 'is-error': validateValue(formValues[row.id], row) }" />
            <div v-if="validateValue(formValues[row.id], row)" style="color:#f56c6c;font-size:11px;margin-top:2px">
              {{ validateValue(formValues[row.id], row) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <span v-if="checkCompliance(formValues[row.id], row.standard_value, row.indicator_type) === true" style="color:#67c23a;font-size:18px">✅</span>
            <span v-else-if="checkCompliance(formValues[row.id], row.standard_value, row.indicator_type) === false" style="color:#f56c6c;font-size:18px">❌</span>
            <span v-else style="color:#c0c4cc">-</span>
          </template>
        </el-table-column>
        <el-table-column label="备注" width="160">
          <template #default="{ row }"><el-input v-model="formRemarks[row.id]" size="small" placeholder="可选" /></template>
        </el-table-column>
      </el-table>
    </el-collapse-item>
  </el-collapse>

  <div v-if="allIndicators.length > 0" style="margin-top:16px;padding:12px 16px;background:#e3f2fd;border-radius:8px;display:flex;justify-content:space-between;align-items:center">
    <div>
      📊 当前预估：<strong>总分 {{ stats.totalScore }} 分</strong> |
      达标 <span style="color:#67c23a;font-weight:600">{{ stats.compliantCount }}</span> / {{ fillProgress.total }} 项 |
      📝 已填 <span style="color:#3b82f6;font-weight:600">{{ fillProgress.filled }}</span> / {{ fillProgress.total }} 项
      <el-progress :percentage="fillProgress.pct" :stroke-width="4" style="width:120px;display:inline-block;margin-left:8px;vertical-align:middle" />
      <span v-if="lastSaved" style="color:#94a3b8;font-size:11px;margin-left:12px">💾 {{ lastSaved }}</span>
    </div>
    <el-button @click="handleSaveDraft" :loading="saving">💾 保存草稿</el-button>
    <el-button type="primary" @click="handleSubmit" :loading="submitting">
      {{ editId ? '📤 重新提交审核' : '📤 提交审核' }}
    </el-button>
  </div>
</div>
`,
})
