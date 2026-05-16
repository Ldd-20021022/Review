import { defineComponent, ref, onMounted, computed } from 'vue'
import { ElMessage } from '/src/shim/element-plus.js'
import { useAuthStore } from '../../stores/auth.js'
import { getStandards, submitRating, getMyRatings } from '../../api/hospital-rating.js'

export default defineComponent({
  name: 'HRRatingForm',
  setup() {
    const auth = useAuthStore()
    const categories = ref([])
    const formValues = ref({})
    const formRemarks = ref({})
    const activeNames = ref([])
    const submitting = ref(false)
    const cycle = ref('2025年度')
    const history = ref([])
    const showHistory = ref(false)

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

    const totalScore = computed(() => {
      let weighted = 0, totalW = 0
      for (const ind of allIndicators.value) {
        const val = formValues.value[ind.id]
        if (val && ind.standard_value && ind.indicator_type && ind.weight) {
          const actual = parseFloat(String(val).replace('%', ''))
          const standard = parseFloat(String(ind.standard_value).replace('%', ''))
          if (isNaN(actual) || isNaN(standard)) continue
          let score = 0
          if (ind.indicator_type === 'numeric_less_equal') {
            const compliant = actual <= standard
            score = compliant ? 100 : Math.max(0, 100 - (actual - standard) * 50)
          } else if (ind.indicator_type === 'numeric_greater_equal') {
            const compliant = actual >= standard
            score = compliant ? 100 : Math.max(0, 100 - (standard - actual) * 50)
          } else if (ind.indicator_type === 'numeric_equal') {
            score = actual === standard ? 100 : 0
          } else if (ind.indicator_type === 'numeric_range') {
            const parts = String(ind.standard_value).replace('%', '').split('-')
            const lo = parseFloat(parts[0]), hi = parseFloat(parts[1])
            const compliant = actual >= lo && actual <= hi
            score = compliant ? 100 : Math.max(0, 100 - Math.min(Math.abs(actual - lo), Math.abs(actual - hi)) * 50)
          } else if (ind.indicator_type === 'yesno') {
            score = ['是','1','yes','true'].includes(String(val).toLowerCase()) ? 100 : 0
          }
          weighted += score * ind.weight / 100
          totalW += ind.weight
        }
      }
      return totalW > 0 ? (weighted / totalW * 100).toFixed(1) : '-'
    })

    const compliantCount = computed(() => {
      let count = 0
      for (const ind of allIndicators.value) {
        const val = formValues.value[ind.id]
        if (!val || !ind.standard_value || !ind.indicator_type) continue
        const actual = parseFloat(String(val).replace('%', ''))
        const standard = parseFloat(String(ind.standard_value).replace('%', ''))
        if (isNaN(actual) || isNaN(standard)) continue
        if (ind.indicator_type === 'numeric_less_equal' && actual <= standard) count++
        else if (ind.indicator_type === 'numeric_greater_equal' && actual >= standard) count++
        else if (ind.indicator_type === 'numeric_equal' && actual === standard) count++
        else if (ind.indicator_type === 'numeric_range') {
          const parts = String(ind.standard_value).replace('%', '').split('-')
          if (actual >= parseFloat(parts[0]) && actual <= parseFloat(parts[1])) count++
        } else if (ind.indicator_type === 'yesno' && ['是','1','yes','true'].includes(String(val).toLowerCase())) count++
      }
      return count
    })

    function checkCompliance(ind) {
      const val = formValues.value[ind.id]
      if (!val || !ind.standard_value || !ind.indicator_type) return null
      const actual = parseFloat(String(val).replace('%', ''))
      const standard = parseFloat(String(ind.standard_value).replace('%', ''))
      if (isNaN(actual) || isNaN(standard)) return null
      if (ind.indicator_type === 'numeric_less_equal') return actual <= standard
      if (ind.indicator_type === 'numeric_greater_equal') return actual >= standard
      if (ind.indicator_type === 'numeric_equal') return actual === standard
      if (ind.indicator_type === 'numeric_range') {
        const parts = String(ind.standard_value).replace('%', '').split('-')
        return actual >= parseFloat(parts[0]) && actual <= parseFloat(parts[1])
      }
      if (ind.indicator_type === 'yesno') return ['是','1','yes','true'].includes(String(val).toLowerCase())
      return null
    }

    async function fetchStandards() {
      categories.value = await getStandards() || []
      activeNames.value = categories.value.map(c => String(c.id))
    }

    async function fetchHistory() {
      history.value = await getMyRatings() || []
    }

    async function handleSubmit() {
      const details = []
      for (const ind of allIndicators.value) {
        const val = formValues.value[ind.id]
        if (val !== undefined && val !== '') {
          details.push({
            indicator_id: ind.id,
            actual_value: String(val),
            remark: formRemarks.value[ind.id] || '',
          })
        }
      }
      if (details.length === 0) {
        ElMessage.warning('请至少填写一项指标数据')
        return
      }
      submitting.value = true
      try {
        await submitRating({ rating_cycle: cycle.value, details })
        ElMessage.success('提交成功！')
        formValues.value = {}
        formRemarks.value = {}
        await fetchHistory()
      } catch (e) {
        ElMessage.error('提交失败: ' + e.message)
      } finally {
        submitting.value = false
      }
    }

    onMounted(() => { fetchStandards(); fetchHistory() })

    return {
      categories, formValues, formRemarks, activeNames, submitting, cycle, cycleOptions,
      allIndicators, totalScore, compliantCount, history, showHistory,
      checkCompliance, handleSubmit,
    }
  },
  template: `
<div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2>📋 三甲评级数据填报</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <el-select v-model="cycle" style="width:140px" size="small">
        <el-option v-for="o in cycleOptions" :key="o" :label="o" :value="o" />
      </el-select>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">📤 提交审核</el-button>
    </div>
  </div>

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
        <el-table-column label="指标名称" min-width="180">
          <template #default="{ row }">{{ row.name }}</template>
        </el-table-column>
        <el-table-column label="标准值" width="120" align="center">
          <template #default="{ row }">{{ row.standard_value }}{{ row.unit ? ' ' + row.unit : '' }}</template>
        </el-table-column>
        <el-table-column label="实际值" width="160" align="center">
          <template #default="{ row }">
            <el-input v-model="formValues[row.id]" size="small" style="width:120px"
              :placeholder="row.unit || '输入值'" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <span v-if="checkCompliance(row) === true" style="color:#67c23a;font-size:18px">✅</span>
            <span v-else-if="checkCompliance(row) === false" style="color:#f56c6c;font-size:18px">❌</span>
            <span v-else style="color:#c0c4cc">-</span>
          </template>
        </el-table-column>
        <el-table-column label="备注" width="160">
          <template #default="{ row }">
            <el-input v-model="formRemarks[row.id]" size="small" placeholder="可选" />
          </template>
        </el-table-column>
      </el-table>
    </el-collapse-item>
  </el-collapse>

  <div v-if="allIndicators.length > 0" style="margin-top:16px;padding:12px 16px;background:#e3f2fd;border-radius:8px;display:flex;justify-content:space-between;align-items:center">
    <div>
      📊 当前预估：<strong>总分 {{ totalScore }} 分</strong> |
      达标 <span style="color:#67c23a;font-weight:600">{{ compliantCount }}</span> / {{ allIndicators.length }} 项
    </div>
    <el-button type="primary" @click="handleSubmit" :loading="submitting">📤 提交审核</el-button>
  </div>
</div>
`,
})
