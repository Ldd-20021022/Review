import { defineComponent, ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from '/src/shim/element-plus.js'
import { useAuthStore } from '../../stores/auth.js'
import { getAssessment, updateScore, submitAssessment, resubmitAssessment } from '../../api/assessments.js'

export default defineComponent({
  name: 'AssessmentDetail',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const auth = useAuthStore()
    const assessment = ref(null)
    const loading = ref(false)
    const saving = ref({})
    const submitting = ref(false)
    const actualInputs = ref({})
    const noteInputs = ref({})

    const isDeptHead = computed(() => auth.user?.role === 'dept_head')
    const isAdmin = computed(() => auth.user?.role === 'admin')
    const canEdit = computed(() =>
      ['draft', 'revising'].includes(assessment.value?.status)
    )

    const compliantCount = computed(() =>
      assessment.value?.items?.filter(i => i.is_compliant).length || 0
    )
    const nonCompliantCount = computed(() =>
      assessment.value?.items?.filter(i => i.is_compliant === false).length || 0
    )
    const totalCount = computed(() => assessment.value?.items?.length || 0)
    const complianceRate = computed(() =>
      totalCount.value ? Math.round(compliantCount.value / totalCount.value * 100) : 0
    )

    // Group items by category
    const groupedItems = computed(() => {
      const groups = {}
      for (const item of assessment.value?.items || []) {
        const cat = item.category_name || '其他'
        if (!groups[cat]) groups[cat] = []
        groups[cat].push(item)
      }
      return groups
    })

    async function fetch() {
      loading.value = true
      try {
        assessment.value = await getAssessment(route.params.id)
        for (const item of assessment.value.items) {
          actualInputs.value[item.id] = item.actual_value || ''
          noteInputs.value[item.id] = item.gap_note || ''
        }
      } finally {
        loading.value = false
      }
    }

    async function onActualChange(itemId, val) {
      actualInputs.value[itemId] = val
      await doSave(itemId)
    }

    async function onNoteChange(itemId, val) {
      noteInputs.value[itemId] = val
    }

    async function doSave(itemId) {
      saving.value[itemId] = true
      try {
        const res = await updateScore(assessment.value.id, itemId, {
          actual_value: actualInputs.value[itemId] || '',
          gap_note: noteInputs.value[itemId] || '',
        })
        // Update local item
        const idx = assessment.value.items.findIndex(i => i.id === itemId)
        if (idx >= 0) {
          assessment.value.items[idx].actual_value = res.actual_value
          assessment.value.items[idx].is_compliant = res.is_compliant
          assessment.value.items[idx].score = res.score
          assessment.value.items[idx].gap_note = res.gap_note
        }
      } catch (e) {
        ElMessage.error('保存失败: ' + e.message)
      } finally {
        saving.value[itemId] = false
      }
    }

    async function handleSubmit() {
      await ElMessageBox.confirm(
        '提交后将无法修改数据，确认提交审核？',
        '确认提交',
        { type: 'warning' }
      )
      submitting.value = true
      try {
        const res = await submitAssessment(assessment.value.id)
        assessment.value = { ...assessment.value, ...res }
        ElMessage.success(`提交成功！总分: ${res.total_score} 分`)
      } catch (e) {
        ElMessage.error('提交失败: ' + e.message)
      } finally {
        submitting.value = false
      }
    }

    async function handleResubmit() {
      await ElMessageBox.confirm(
        '将进入整改编辑状态，可修改数据后重新提交。',
        '开始整改',
        { type: 'info' }
      )
      try {
        const res = await resubmitAssessment(assessment.value.id)
        assessment.value = { ...assessment.value, ...res }
        ElMessage.info('已进入整改状态，请修改数据后重新提交')
      } catch (e) {
        ElMessage.error('操作失败: ' + e.message)
      }
    }

    function goBack() {
      if (isDeptHead.value) router.push('/assessments')
      else router.push('/dashboard')
    }

    const statusMap = {
      draft: '草稿',
      submitted: '待审核',
      approved: '已通过',
      rejected: '已退回',
      revising: '整改中',
      review: '审核中',
    }

    onMounted(fetch)

    return {
      assessment, loading, saving, submitting, actualInputs, noteInputs,
      isDeptHead, isAdmin, canEdit,
      compliantCount, nonCompliantCount, totalCount, complianceRate,
      groupedItems,
      onActualChange, onNoteChange, handleSubmit, handleResubmit, goBack,
      statusMap,
    }
  },
  template: `
<div v-loading="loading" style="max-width:960px;margin:0 auto">
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div>
      <el-button text @click="goBack">&larr; 返回</el-button>
      <h3 style="display:inline;margin-left:8px">{{ assessment?.name }}</h3>
      <el-tag style="margin-left:12px">{{ assessment?.target_level }}级</el-tag>
      <el-tag :type="statusMap[assessment?.status] === '已通过' ? 'success' : assessment?.status === 'rejected' ? 'danger' : 'info'"
        style="margin-left:8px">{{ statusMap[assessment?.status] || assessment?.status }}</el-tag>
    </div>
    <div style="display:flex;gap:8px">
      <el-button v-if="canEdit" type="primary" @click="handleSubmit" :loading="submitting">
        📤 提交审核
      </el-button>
      <el-button v-if="assessment?.status === 'rejected' && isDeptHead"
        type="warning" @click="handleResubmit">
        🔄 开始整改
      </el-button>
    </div>
  </div>

  <!-- Summary bar -->
  <el-card style="margin-bottom:16px">
    <el-row :gutter="24">
      <el-col :span="6">
        <div style="text-align:center">
          <p style="color:#909399;font-size:13px">总分</p>
          <h2 :style="{color: (assessment?.total_score || 0) >= 60 ? '#67c23a' : '#f56c6c'}">
            {{ assessment?.total_score || '-' }}
          </h2>
        </div>
      </el-col>
      <el-col :span="6">
        <div style="text-align:center">
          <p style="color:#909399;font-size:13px">达标率</p>
          <h2>{{ complianceRate }}%</h2>
        </div>
      </el-col>
      <el-col :span="6">
        <div style="text-align:center">
          <p style="color:#67c23a;font-size:13px">✅ 达标</p>
          <h2 style="color:#67c23a">{{ compliantCount }}</h2>
        </div>
      </el-col>
      <el-col :span="6">
        <div style="text-align:center">
          <p style="color:#f56c6c;font-size:13px">❌ 未达标</p>
          <h2 style="color:#f56c6c">{{ nonCompliantCount }}</h2>
        </div>
      </el-col>
    </el-row>
  </el-card>

  <!-- Rating form by category -->
  <el-card v-for="(items, catName) in groupedItems" :key="catName" style="margin-bottom:12px">
    <template #header>
      <span style="font-weight:bold">▼ {{ catName }}</span>
      <span v-if="assessment?.items?.find(i => i.category_name === catName && i.indicator_type)"
        style="font-size:12px;color:#909399;margin-left:8px">
        (type: {{ assessment?.items?.find(i => i.category_name === catName).indicator_type }})
      </span>
    </template>

    <div v-for="item in items" :key="item.id"
      style="border-bottom:1px solid #f0f0f0;padding:14px 0"
      :style="{ background: item.is_compliant === true ? '#f6ffed' : item.is_compliant === false ? '#fff2f0' : 'transparent' }">

      <div style="display:flex;align-items:center;gap:16px">
        <!-- Indicator info -->
        <div style="flex:2;min-width:0">
          <div style="display:flex;align-items:center;gap:8px">
            <el-tag size="small" type="info">{{ item.indicator_code }}</el-tag>
            <strong>{{ item.indicator_name }}</strong>
          </div>
          <p v-if="item.req_text" style="font-size:12px;color:#909399;margin:4px 0 0 0">
            要求: {{ item.req_text }}
          </p>
        </div>

        <!-- Standard value -->
        <div style="flex:1;text-align:center">
          <span style="font-size:13px;color:#606266">标准: </span>
          <el-tag size="small">{{ item.standard_value || '-' }}{{ item.unit || '' }}</el-tag>
        </div>

        <!-- Actual value input -->
        <div style="flex:2;display:flex;align-items:center;gap:8px">
          <el-input
            v-model="actualInputs[item.id]"
            :disabled="!canEdit"
            placeholder="填写实际值..."
            size="small"
            style="width:160px"
            @change="onActualChange(item.id, $event)"
          >
            <template #suffix v-if="item.unit">{{ item.unit }}</template>
          </el-input>

          <!-- Compliance badge -->
          <el-tag v-if="item.is_compliant === true" type="success" size="small">✅ 达标</el-tag>
          <el-tag v-else-if="item.is_compliant === false" type="danger" size="small">❌ 未达标</el-tag>

          <!-- Saving indicator -->
          <el-icon v-if="saving[item.id]" class="is-loading" size="14"><span>⟳</span></el-icon>
        </div>

        <!-- Score -->
        <div style="flex:0.5;text-align:right">
          <span v-if="item.score != null"
            style="font-weight:bold"
            :style="{color: item.score >= 80 ? '#67c23a' : item.score >= 60 ? '#e6a23c' : '#f56c6c'}">
            {{ item.score }}分
          </span>
          <span v-else style="color:#c0c4cc;font-size:12px">-</span>
        </div>
      </div>

      <!-- Note input -->
      <div v-if="canEdit" style="margin-top:8px">
        <el-input
          v-model="noteInputs[item.id]"
          placeholder="备注说明（可选）"
          size="small"
          clearable
          @change="onNoteChange(item.id, $event)"
        />
      </div>
    </div>

    <div v-if="!items.length" style="text-align:center;color:#c0c4cc;padding:20px">
      暂无指标
    </div>
  </el-card>
</div>
`,
})
