import { defineComponent, ref, onMounted } from 'vue'
import { searchRegulations, searchCases } from '../../api/knowledge.js'
import { aiAsyncWithPolling } from '../../api/ai.js'
import { ElMessage } from '/src/shim/element-plus.js'

export default defineComponent({
  name: 'HRKnowledge',
  setup() {
    const tab = ref('ai')
    const query = ref('')
    const regulations = ref([])
    const cases = ref([])
    const loading = ref(false)

    // AI search state
    const aiAnswer = ref('')
    const aiSources = ref([])
    const aiLoading = ref(false)

    // AI case suggestion state
    const suggestIndicator = ref('')
    const suggestProblem = ref('')
    const suggestResult = ref('')
    const suggestLoading = ref(false)
    const suggestRefs = ref([])

    async function search() {
      if (tab.value === 'ai') {
        await doAISearch()
        return
      }
      loading.value = true
      try {
        if (tab.value === 'regulations') {
          regulations.value = await searchRegulations(query.value) || []
        } else if (tab.value === 'cases') {
          cases.value = await searchCases(query.value, '') || []
        }
      } finally { loading.value = false }
    }

    // AI progress state
    const aiProgress = ref('')
    const suggestProgress = ref('')

    async function doAISearch() {
      if (!query.value.trim()) { ElMessage.warning('请输入问题'); return }
      aiLoading.value = true
      aiAnswer.value = ''
      aiSources.value = []
      aiProgress.value = '正在提交AI任务...'
      try {
        const { result, error, timedOut } = await aiAsyncWithPolling('knowledge_search', { q: query.value }, {
          onProgress: ({ status, elapsed }) => {
            aiProgress.value = status === 'running' ? 'AI 正在检索知识库... (已等待 ' + elapsed + '秒)' : ''
          }
        })
        if (error || timedOut) { ElMessage.error(error || '请求超时'); return }
        aiAnswer.value = (result && result.answer) || 'AI 暂未返回结果'
        aiSources.value = (result && result.sources) || []
      } catch (e) {
        ElMessage.error('AI 检索失败: ' + (e.message || '服务暂不可用'))
      } finally { aiLoading.value = false; aiProgress.value = '' }
    }

    async function doCaseSuggest() {
      if (!suggestIndicator.value.trim()) { ElMessage.warning('请输入指标名称'); return }
      suggestLoading.value = true
      suggestResult.value = ''
      suggestRefs.value = []
      suggestProgress.value = '正在提交AI任务...'
      try {
        const { result, error, timedOut } = await aiAsyncWithPolling('suggest_case', {
          indicator_name: suggestIndicator.value,
          problem_desc: suggestProblem.value
        }, {
          onProgress: ({ status, elapsed }) => {
            suggestProgress.value = status === 'running' ? 'AI 正在生成整改方案... (已等待 ' + elapsed + '秒)' : ''
          }
        })
        if (error || timedOut) { ElMessage.error(error || '请求超时'); return }
        suggestResult.value = (result && result.suggestion) || '暂无建议'
        suggestRefs.value = (result && result.references) || []
      } catch (e) {
        ElMessage.error('AI 建议生成失败: ' + (e.message || '服务暂不可用'))
      } finally { suggestLoading.value = false; suggestProgress.value = '' }
    }

    function handleTabChange(t) {
      tab.value = t
      if (t !== 'suggest') search()
    }

    const diffMap = { easy: '🟢 简单', medium: '🟡 中等', hard: '🔴 困难' }

    onMounted(() => search())

    return {
      tab, query, regulations, cases, loading, search,
      aiAnswer, aiSources, aiLoading, aiProgress, doAISearch,
      suggestIndicator, suggestProblem, suggestResult, suggestLoading, suggestProgress, suggestRefs, doCaseSuggest,
      handleTabChange, diffMap,
    }
  },
  template: `
<div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2>📚 知识库</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <el-input v-model="query" placeholder="搜索..." size="small" style="width:240px" @keyup.enter="search" clearable />
      <el-button type="primary" size="small" @click="search">搜索</el-button>
    </div>
  </div>

  <el-tabs v-model="tab" @tab-change="handleTabChange">
    <!-- ═══════════ AI 智能检索 ═══════════ -->
    <el-tab-pane label="🤖 AI 智能检索" name="ai">
      <div v-if="!aiAnswer && !aiLoading" style="text-align:center;padding:60px;color:#94a3b8">
        <p style="font-size:48px;margin:0">🤖</p>
        <p style="font-size:16px;margin-top:12px">输入自然语言问题，AI 将综合知识库为您解答</p>
        <p style="font-size:13px">例如："三甲医院评审中，住院患者死亡率的标准是什么？"</p>
      </div>

      <div v-if="aiLoading" style="text-align:center;padding:40px">
        <span style="font-size:32px">⏳</span>
        <p style="color:#94a3b8;margin-top:12px">{{ aiProgress || 'AI 正在分析知识库，请稍候...' }}</p>
      </div>

      <el-card v-if="aiAnswer" style="border-left:4px solid #3b82f6">
        <template #header>
          <span style="font-weight:bold">🤖 AI 回答</span>
          <span v-if="aiSources.length>0" style="color:#94a3b8;font-size:12px;margin-left:8px">
            参考 {{ aiSources.length }} 条知识库记录
          </span>
        </template>
        <div style="line-height:1.9;color:#334155;font-size:14px;white-space:pre-wrap">{{ aiAnswer }}</div>

        <div v-if="aiSources.length > 0" style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:6px">
          <strong style="font-size:13px;color:#64748b">📎 信息来源：</strong>
          <div v-for="(s, i) in aiSources" :key="i" style="font-size:12px;color:#94a3b8;margin-top:4px">
            {{ s.type === 'regulation' ? '📖' : '💡' }} {{ s.title }}
          </div>
        </div>
      </el-card>
    </el-tab-pane>

    <!-- ═══════════ AI 整改建议 ═══════════ -->
    <el-tab-pane label="🔧 AI 整改建议" name="suggest">
      <el-card style="margin-bottom:16px">
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="font-size:13px;color:#64748b;margin-bottom:4px">未达标指标名称</div>
            <el-input v-model="suggestIndicator" placeholder="例如：处方合格率" size="small" />
          </div>
          <div style="flex:2;min-width:280px">
            <div style="font-size:13px;color:#64748b;margin-bottom:4px">问题描述（可选）</div>
            <el-input v-model="suggestProblem" placeholder="例如：门诊处方合格率仅92%，低于标准≥95%" size="small" />
          </div>
          <el-button type="primary" size="small" @click="doCaseSuggest" :loading="suggestLoading" style="margin-bottom:2px">
            🤖 生成整改方案
          </el-button>
        </div>
      </el-card>

      <div v-if="suggestLoading" style="text-align:center;padding:40px">
        <span style="font-size:32px">⏳</span>
        <p style="color:#94a3b8;margin-top:12px">{{ suggestProgress || 'AI 正在生成整改方案，请稍候...' }}</p>
      </div>

      <el-card v-if="suggestResult" style="border-left:4px solid #e6a23c">
        <template #header><span style="font-weight:bold">🔧 AI 整改方案</span></template>
        <div style="line-height:1.9;color:#334155;font-size:14px;white-space:pre-wrap">{{ suggestResult }}</div>
        <div v-if="suggestRefs.length > 0" style="margin-top:12px;padding:12px;background:#f8fafc;border-radius:6px">
          <strong style="font-size:13px;color:#64748b">📎 参考案例：</strong>
          <div v-for="(r, i) in suggestRefs" :key="i" style="font-size:12px;color:#94a3b8;margin-top:4px">
            💡 {{ r.title }} — {{ r.solution?.slice(0, 60) || '' }}...
          </div>
        </div>
      </el-card>

      <div v-if="!suggestResult && !suggestLoading" style="text-align:center;padding:60px;color:#94a3b8">
        <p style="font-size:48px;margin:0">🔧</p>
        <p style="font-size:16px;margin-top:12px">输入未达标指标名称，AI 将为您生成具体的整改方案</p>
      </div>
    </el-tab-pane>

    <!-- ═══════════ 法规条文 ═══════════ -->
    <el-tab-pane label="📖 法规条文" name="regulations">
      <div v-if="regulations.length===0" style="text-align:center;padding:40px;color:#94a3b8">暂无结果，请尝试搜索</div>
      <el-card v-for="r in regulations" :key="r.id" style="margin-bottom:12px">
        <template #header>
          <span style="font-weight:600">{{ r.chapter }} {{ r.article }} — {{ r.title }}</span>
        </template>
        <p style="line-height:1.7;color:#475569;white-space:pre-wrap">{{ r.content }}</p>
        <div v-if="r.interpretation" style="margin-top:12px;padding:12px;background:#f0fdf4;border-radius:6px;font-size:13px;color:#475569">
          <strong>📝 解读：</strong>{{ r.interpretation }}
        </div>
      </el-card>
    </el-tab-pane>

    <!-- ═══════════ 整改案例 ═══════════ -->
    <el-tab-pane label="💡 整改案例" name="cases">
      <div v-if="cases.length===0" style="text-align:center;padding:40px;color:#94a3b8">暂无结果，请尝试搜索</div>
      <el-card v-for="c in cases" :key="c.id" style="margin-bottom:12px">
        <template #header>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600">{{ c.indicator_name }}</span>
            <el-tag size="small" :type="c.difficulty==='hard'?'danger':c.difficulty==='medium'?'warning':'success'">{{ diffMap[c.difficulty] }}</el-tag>
          </div>
          <span style="font-size:12px;color:#94a3b8">{{ c.category }} · 整改周期: {{ c.duration }}</span>
        </template>
        <div style="font-size:13px;line-height:1.7">
          <p><strong>🔴 问题：</strong>{{ c.problem }}</p>
          <p><strong>🔍 根因：</strong>{{ c.root_cause }}</p>
          <p><strong>✅ 措施：</strong>{{ c.solution }}</p>
          <p style="color:#16a34a"><strong>📊 效果：</strong>{{ c.result }}</p>
        </div>
      </el-card>
    </el-tab-pane>
  </el-tabs>
</div>
`,
})
