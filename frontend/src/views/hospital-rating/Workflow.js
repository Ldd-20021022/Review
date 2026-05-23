import { defineComponent, ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from '/src/shim/element-plus.js'
import { get, post, put } from '../../api/client.js'
import { aiAsyncWithPolling } from '../../api/ai.js'

export default defineComponent({
  name: 'HRWorkflow',
  setup() {
    const router = useRouter()
    const tab = ref('pdca')

    // ── PDCA state ──
    const pdcaList = ref([])
    const pdcaLoading = ref(false)
    const aiPlanLoading = ref({})
    const aiPlans = ref({})
    const createPDCADialog = ref(false)
    const createPDCAForm = ref({ assessment_id: null })
    const assessments = ref([])

    // ── Meeting state ──
    const meetings = ref([])
    const meetingLoading = ref(false)
    const meetingDialog = ref(false)
    const meetingForm = ref({
      title: '', meeting_date: '', attendees: '',
      topics: '', discussion: '', conclusions: '',
      votes_approve: 0, votes_reject: 0, votes_abstain: 0,
    })
    const aiSummaryLoading = ref({})
    const aiSummaries = ref({})

    // ── Inspection state ──
    const inspectionLoading = ref(false)
    const inspectionResult = ref(null)
    const inspectionCount = ref(10)
    const inspectionFilter = ref('')
    const inspectionAILoading = ref(false)

    const phaseMap = { plan: '📋 计划', do: '🔧 执行', check: '🔍 检查', act: '✅ 处理' }
    const statusMap = { active: '🔄 进行中', completed: '✅ 已完成' }

    // ═══════════════ PDCA ═══════════════
    async function fetchPDCAList() {
      pdcaLoading.value = true
      try { pdcaList.value = await get('/api/workflow/pdca/list') || [] }
      finally { pdcaLoading.value = false }
    }

    async function fetchAssessments() {
      try { assessments.value = await get('/api/hospital-ratings/my-department') || [] }
      catch { assessments.value = [] }
    }

    async function createPDCA() {
      if (!createPDCAForm.value.assessment_id) { ElMessage.warning('请选择评估'); return }
      try {
        await post('/api/workflow/pdca/create', { assessment_id: createPDCAForm.value.assessment_id })
        ElMessage.success('PDCA项目已创建')
        createPDCADialog.value = false
        await fetchPDCAList()
      } catch (e) { ElMessage.error('创建失败: ' + (e.message || '')) }
    }

    const pdcaAIProgress = ref({})

    async function generatePlan(pid) {
      aiPlanLoading.value[pid] = true
      pdcaAIProgress.value[pid] = '提交中...'
      try {
        const { result, error } = await aiAsyncWithPolling('pdca_plan', { pdca_id: pid }, {
          onProgress: ({ status, elapsed }) => {
            pdcaAIProgress.value[pid] = status === 'running' ? 'AI 生成计划中... (' + elapsed + '秒)' : ''
          }
        })
        if (error) { ElMessage.error(error); return }
        aiPlans.value[pid] = (result && result.plan) || '未生成计划'
        ElMessage.success('AI 改进计划已生成')
        await fetchPDCAList()
      } catch (e) { ElMessage.error('AI 生成失败: ' + (e.message || '')) }
      finally { aiPlanLoading.value[pid] = false; pdcaAIProgress.value[pid] = '' }
    }

    // ── Phase edit dialog ──
    const phaseDialog = ref(false)
    const phaseForm = ref({ pid: null, phase: 'plan', detail: '', due_date: '' })

    function openPhaseDialog(p) {
      phaseForm.value = {
        pid: p.id,
        phase: p.phase || 'plan',
        detail: p[p.phase + '_detail'] || p.plan_detail || '',
        due_date: p.due_date || '',
      }
      phaseDialog.value = true
    }

    async function savePhase() {
      try {
        await put('/api/workflow/pdca/' + phaseForm.value.pid, {
          phase: phaseForm.value.phase,
          detail: phaseForm.value.detail,
          due_date: phaseForm.value.due_date,
        })
        ElMessage.success('阶段已更新')
        phaseDialog.value = false
        await fetchPDCAList()
      } catch (e) { ElMessage.error('更新失败: ' + (e.message || '')) }
    }

    async function updatePDCAPhase(pid, phase, detail) {
      try {
        await put('/api/workflow/pdca/' + pid, { phase, detail })
        ElMessage.success('已更新')
        await fetchPDCAList()
      } catch (e) { ElMessage.error('更新失败: ' + (e.message || '')) }
    }

    // ═══════════════ Meeting ═══════════════
    async function fetchMeetings() {
      meetingLoading.value = true
      try { meetings.value = await get('/api/workflow/meetings') || [] }
      finally { meetingLoading.value = false }
    }

    async function createMeeting() {
      if (!meetingForm.value.title) { ElMessage.warning('请输入会议标题'); return }
      try {
        await post('/api/workflow/meetings', meetingForm.value)
        ElMessage.success('会议记录已创建')
        meetingDialog.value = false
        meetingForm.value = { title: '', meeting_date: '', attendees: '', topics: '', discussion: '', conclusions: '', votes_approve: 0, votes_reject: 0, votes_abstain: 0 }
        await fetchMeetings()
      } catch (e) { ElMessage.error('创建失败: ' + (e.message || '')) }
    }

    const summaryAIProgress = ref({})

    async function generateSummary(mid) {
      aiSummaryLoading.value[mid] = true
      summaryAIProgress.value[mid] = '提交中...'
      try {
        const { result, error } = await aiAsyncWithPolling('meeting_summary', { meeting_id: mid }, {
          onProgress: ({ status, elapsed }) => {
            summaryAIProgress.value[mid] = status === 'running' ? 'AI 生成纪要中... (' + elapsed + '秒)' : ''
          }
        })
        if (error) { ElMessage.error(error); return }
        aiSummaries.value[mid] = (result && result.summary) || '未生成纪要'
        ElMessage.success('AI 会议纪要已生成')
      } catch (e) { ElMessage.error('AI 生成失败: ' + (e.message || '')) }
      finally { aiSummaryLoading.value[mid] = false; summaryAIProgress.value[mid] = '' }
    }

    // ═══════════════ Inspection ═══════════════
    async function doInspection() {
      inspectionLoading.value = true
      try {
        inspectionResult.value = await get('/api/workflow/inspection', { count: inspectionCount.value })
      } catch (e) { ElMessage.error('抽检失败: ' + (e.message || '')) }
      finally { inspectionLoading.value = false }
    }

    async function doAIInspection() {
      inspectionAILoading.value = true
      try {
        const res = await aiInspectionAnalysis(inspectionCount.value, inspectionFilter.value)
        inspectionResult.value = res
        ElMessage.success('AI 抽检分析完成')
      } catch (e) { ElMessage.error('AI 分析失败: ' + (e.message || '')) }
      finally { inspectionAILoading.value = false }
    }

    function goReport(aid) { router.push('/hospital-rating/reports?assessment=' + aid) }

    onMounted(() => { fetchPDCAList(); fetchMeetings(); fetchAssessments() })

    return {
      tab, pdcaList, pdcaLoading, aiPlanLoading, aiPlans, createPDCADialog, createPDCAForm, assessments,
      createPDCA, generatePlan, updatePDCAPhase, openPhaseDialog, savePhase, goReport,
      phaseDialog, phaseForm, pdcaAIProgress,
      meetings, meetingLoading, meetingDialog, meetingForm, createMeeting,
      aiSummaryLoading, aiSummaries, summaryAIProgress, generateSummary,
      inspectionLoading, inspectionResult, inspectionCount, inspectionFilter, inspectionAILoading,
      doInspection, doAIInspection,
      phaseMap, statusMap, fetchPDCAList, fetchMeetings,
    }
  },
  template: `
<div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2>🔄 质量改进工作流</h2>
  </div>

  <el-tabs v-model="tab">
    <!-- ═══════════ PDCA 改进项目 ═══════════ -->
    <el-tab-pane label="🔄 PDCA 改进" name="pdca">
      <div style="margin-bottom:12px;display:flex;gap:8px">
        <el-button type="primary" size="small" @click="createPDCADialog = true">+ 新建 PDCA 项目</el-button>
        <span style="font-size:12px;color:#94a3b8;line-height:32px">从未达标指标自动生成改进项目</span>
      </div>

      <div v-loading="pdcaLoading">
        <div v-if="pdcaList.length===0" style="text-align:center;padding:60px;color:#94a3b8">
          <p style="font-size:48px;margin:0">🔄</p>
          <p>暂无 PDCA 改进项目</p>
          <p style="font-size:13px">提交科室评级后，系统将自动识别未达标指标并创建改进项目</p>
        </div>

        <el-card v-for="p in pdcaList" :key="p.id" style="margin-bottom:12px">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600">{{ p.title }}</span>
              <div style="display:flex;gap:6px;align-items:center">
                <el-tag size="small" :type="p.status === 'completed' ? 'success' : 'warning'">
                  {{ statusMap[p.status] || p.status }}
                </el-tag>
                <el-tag size="small" :type="p.phase==='plan'?'info':p.phase==='do'?'warning':p.phase==='check'?'primary':'success'">
                  {{ phaseMap[p.phase] || p.phase }}
                </el-tag>
              </div>
            </div>
          </template>

          <!-- Phase Timeline -->
          <div style="display:flex;gap:0;align-items:center;margin-bottom:12px;position:relative">
            <div v-for="(ph, idx) in ['plan','do','check','act']" :key="ph"
              style="flex:1;text-align:center;position:relative">
              <!-- Connector line -->
              <div v-if="idx < 3" style="position:absolute;top:10px;left:50%;width:100%;height:2px;z-index:0"
                :style="{background: p[ph+'_detail'] ? '#67c23a' : '#e2e8f0'}" />
              <!-- Circle -->
              <div style="width:20px;height:20px;border-radius:50%;margin:0 auto;position:relative;z-index:1;display:flex;align-items:center;justify-content:center;font-size:10px"
                :style="{
                  background: p.phase === ph ? '#3b82f6' : p[ph+'_detail'] ? '#67c23a' : '#e2e8f0',
                  color: p.phase === ph || p[ph+'_detail'] ? '#fff' : '#94a3b8'
                }">
                {{ p[ph+'_detail'] ? '✓' : idx+1 }}
              </div>
              <div style="font-size:10px;margin-top:4px;color:#64748b">{{ ['计划','执行','检查','处理'][idx] }}</div>
            </div>
          </div>

          <div style="display:flex;gap:12px;font-size:13px;color:#64748b;margin-bottom:12px">
            <span>当前值: <b style="color:#f56c6c">{{ p.current_value }}</b></span>
            <span>→</span>
            <span>目标值: <b style="color:#16a34a">{{ p.target_value }}</b></span>
            <span v-if="p.due_date" style="margin-left:auto">📅 {{ p.due_date }}</span>
          </div>

          <!-- AI generated plan -->
          <div v-if="aiPlans[p.id]" style="padding:12px;background:#f0fdf4;border-radius:6px;margin-bottom:8px;line-height:1.7;font-size:13px;white-space:pre-wrap;color:#334155">
            {{ aiPlans[p.id] }}
          </div>

          <!-- Existing plan detail -->
          <div v-else-if="p.plan_detail" style="padding:12px;background:#f8fafc;border-radius:6px;margin-bottom:8px;line-height:1.7;font-size:13px;white-space:pre-wrap;color:#475569">
            {{ p.plan_detail }}
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <el-button size="small" type="warning" @click="generatePlan(p.id)" :loading="aiPlanLoading[p.id]">
              {{ aiPlanLoading[p.id] ? (pdcaAIProgress[p.id] || '⏳ AI 生成中...') : '🤖 AI 生成改进计划' }}
            </el-button>
            <el-button size="small" type="primary" @click="openPhaseDialog(p)">📝 更新阶段</el-button>
            <el-button size="small" @click="goReport(p.assessment_id)">📄 查看评估</el-button>
          </div>
        </el-card>
      </div>

      <!-- Phase edit dialog -->
      <el-dialog v-model="phaseDialog" title="📝 更新 PDCA 阶段" width="550px">
        <el-form label-width="80px">
          <el-form-item label="当前阶段">
            <el-select v-model="phaseForm.phase" style="width:100%">
              <el-option label="📋 Plan — 计划" value="plan" />
              <el-option label="🔧 Do — 执行" value="do" />
              <el-option label="🔍 Check — 检查" value="check" />
              <el-option label="✅ Act — 处理" value="act" />
            </el-select>
          </el-form-item>
          <el-form-item label="详细内容">
            <el-input v-model="phaseForm.detail" type="textarea" :rows="6"
              placeholder="记录本阶段的措施、发现、成果..." />
          </el-form-item>
          <el-form-item label="截止日期">
            <el-input v-model="phaseForm.due_date" type="date" size="small" style="width:200px" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="phaseDialog = false">取消</el-button>
          <el-button type="primary" @click="savePhase">保存</el-button>
        </template>
      </el-dialog>

      <!-- Create PDCA dialog -->
      <el-dialog v-model="createPDCADialog" title="新建 PDCA 改进项目" width="450px">
        <el-form label-width="80px">
          <el-form-item label="选择评估">
            <el-select v-model="createPDCAForm.assessment_id" placeholder="选择评估记录" style="width:100%">
              <el-option v-for="a in assessments" :key="a.id" :label="a.name + ' (' + (a.rating_cycle||'') + ')'" :value="a.id" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="createPDCADialog = false">取消</el-button>
          <el-button type="primary" @click="createPDCA">创建</el-button>
        </template>
      </el-dialog>
    </el-tab-pane>

    <!-- ═══════════ 评审会议 ═══════════ -->
    <el-tab-pane label="📋 评审会议" name="meetings">
      <div style="margin-bottom:12px">
        <el-button type="primary" size="small" @click="meetingDialog = true">+ 新建会议记录</el-button>
      </div>

      <div v-loading="meetingLoading">
        <div v-if="meetings.length===0" style="text-align:center;padding:60px;color:#94a3b8">
          <p style="font-size:48px;margin:0">📋</p>
          <p>暂无评审会议记录</p>
        </div>

        <el-card v-for="m in meetings" :key="m.id" style="margin-bottom:12px">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600">{{ m.title }}</span>
              <span style="font-size:12px;color:#94a3b8">{{ m.meeting_date }}</span>
            </div>
          </template>

          <div style="font-size:13px;line-height:1.7;color:#475569">
            <div v-if="m.attendees"><b>参会人员：</b>{{ m.attendees }}</div>
            <div v-if="m.topics"><b>议题：</b>{{ m.topics }}</div>
            <div v-if="m.discussion" style="margin-top:8px"><b>讨论内容：</b></div>
            <div v-if="m.discussion" style="color:#64748b;white-space:pre-wrap">{{ m.discussion }}</div>
            <div v-if="m.conclusions" style="margin-top:8px;padding:8px;background:#f0fdf4;border-radius:4px">
              <b>结论：</b>{{ m.conclusions }}
            </div>
            <div style="color:#94a3b8;margin-top:4px">🗳 {{ m.votes || '0赞成/0反对/0弃权' }}</div>
          </div>

          <!-- AI summary -->
          <div v-if="aiSummaries[m.id]" style="margin-top:12px;padding:12px;background:#eff6ff;border-radius:6px;border-left:3px solid #3b82f6;line-height:1.7;font-size:13px;white-space:pre-wrap;color:#334155">
            {{ aiSummaries[m.id] }}
          </div>

          <div style="margin-top:8px">
            <el-button size="small" type="primary" @click="generateSummary(m.id)" :loading="aiSummaryLoading[m.id]">
              {{ aiSummaryLoading[m.id] ? (summaryAIProgress[m.id] || '⏳ AI 生成中...') : '🤖 AI 生成会议纪要' }}
            </el-button>
          </div>
        </el-card>
      </div>

      <!-- Create meeting dialog -->
      <el-dialog v-model="meetingDialog" title="新建会议记录" width="550px">
        <el-form label-width="80px">
          <el-form-item label="会议标题"><el-input v-model="meetingForm.title" size="small" /></el-form-item>
          <el-form-item label="日期"><el-input v-model="meetingForm.meeting_date" size="small" type="date" /></el-form-item>
          <el-form-item label="参会人员"><el-input v-model="meetingForm.attendees" size="small" placeholder="张三, 李四..." /></el-form-item>
          <el-form-item label="议题"><el-input v-model="meetingForm.topics" size="small" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="讨论内容"><el-input v-model="meetingForm.discussion" size="small" type="textarea" :rows="3" /></el-form-item>
          <el-form-item label="会议结论"><el-input v-model="meetingForm.conclusions" size="small" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="投票">
            <div style="display:flex;gap:12px">
              <span>赞成 <el-input-number v-model="meetingForm.votes_approve" :min="0" size="small" style="width:80px" /></span>
              <span>反对 <el-input-number v-model="meetingForm.votes_reject" :min="0" size="small" style="width:80px" /></span>
              <span>弃权 <el-input-number v-model="meetingForm.votes_abstain" :min="0" size="small" style="width:80px" /></span>
            </div>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="meetingDialog = false">取消</el-button>
          <el-button type="primary" @click="createMeeting">创建</el-button>
        </template>
      </el-dialog>
    </el-tab-pane>

    <!-- ═══════════ 模拟抽检 ═══════════ -->
    <el-tab-pane label="🎲 模拟抽检" name="inspection">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
        <span style="font-size:13px;color:#64748b">抽检数量:</span>
        <el-input-number v-model="inspectionCount" :min="1" :max="50" size="small" />
        <span style="font-size:13px;color:#64748b;margin-left:8px">分类筛选:</span>
        <el-input v-model="inspectionFilter" placeholder="可选" size="small" style="width:120px" />
        <el-button size="small" @click="doInspection" :loading="inspectionLoading">🎲 随机抽检</el-button>
        <el-button size="small" type="warning" @click="doAIInspection" :loading="inspectionAILoading">🤖 AI 抽检分析</el-button>
      </div>

      <div v-if="inspectionResult">
        <!-- Stats cards -->
        <div style="display:flex;gap:12px;margin-bottom:16px">
          <el-card shadow="hover" style="flex:1;text-align:center">
            <div style="font-size:24px;font-weight:700;color:#409eff">{{ inspectionResult.total }}</div>
            <div style="font-size:12px;color:#94a3b8">抽检总数</div>
          </el-card>
          <el-card shadow="hover" style="flex:1;text-align:center">
            <div style="font-size:24px;font-weight:700;color:#67c23a">{{ inspectionResult.compliant }}</div>
            <div style="font-size:12px;color:#94a3b8">达标数</div>
          </el-card>
          <el-card shadow="hover" style="flex:1;text-align:center">
            <div :style="{fontSize:'24px',fontWeight:'700',color:inspectionResult.pass_rate >= 60 ? '#67c23a' : '#f56c6c'}">{{ inspectionResult.pass_rate }}%</div>
            <div style="font-size:12px;color:#94a3b8">通过率</div>
          </el-card>
        </div>

        <!-- AI Analysis -->
        <el-card v-if="inspectionResult.ai_analysis" style="margin-bottom:12px;border-left:4px solid #3b82f6">
          <template #header><span style="font-weight:bold">🤖 AI 分析</span></template>
          <div style="line-height:1.8;color:#334155;font-size:14px;white-space:pre-wrap">{{ inspectionResult.ai_analysis }}</div>
        </el-card>

        <!-- Items -->
        <el-card>
          <template #header><span style="font-weight:bold">抽检明细</span></template>
          <el-table :data="inspectionResult.items || []" stripe size="small">
            <el-table-column label="科室" width="100"><template #default="{row}">{{ row.dept_name }}</template></el-table-column>
            <el-table-column label="指标" min-width="160"><template #default="{row}">{{ row.indicator_name }}</template></el-table-column>
            <el-table-column label="分类" width="100"><template #default="{row}">{{ row.category }}</template></el-table-column>
            <el-table-column label="标准值" width="100" align="center"><template #default="{row}">{{ row.standard_value }}{{ row.unit ? ' ' + row.unit : '' }}</template></el-table-column>
            <el-table-column label="实际值" width="100" align="center"><template #default="{row}">{{ row.actual_value }}</template></el-table-column>
            <el-table-column label="结果" width="80" align="center">
              <template #default="{row}">
                <el-tag :type="row.is_compliant ? 'success' : 'danger'" size="small">{{ row.is_compliant ? '✅' : '❌' }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>

      <div v-else style="text-align:center;padding:60px;color:#94a3b8">
        <p style="font-size:48px;margin:0">🎲</p>
        <p>点击"随机抽检"从全院指标中随机抽取检查项</p>
        <p style="font-size:13px">使用"AI 抽检分析"还可获得AI对薄弱环节的分析</p>
      </div>
    </el-tab-pane>
  </el-tabs>
</div>
`,
})
