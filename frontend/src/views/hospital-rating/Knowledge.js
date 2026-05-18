import { defineComponent, ref, onMounted } from 'vue'
import { searchRegulations, searchCases } from '../../api/knowledge.js'

export default defineComponent({
  name: 'HRKnowledge',
  setup() {
    const tab = ref('regulations')
    const query = ref('')
    const regulations = ref([])
    const cases = ref([])
    const loading = ref(false)

    async function search() {
      loading.value = true
      try {
        if (tab.value === 'regulations') {
          regulations.value = await searchRegulations(query.value) || []
        } else {
          cases.value = await searchCases(query.value, '') || []
        }
      } finally { loading.value = false }
    }

    const diffMap = { easy: '🟢 简单', medium: '🟡 中等', hard: '🔴 困难' }

    onMounted(search)

    return { tab, query, regulations, cases, loading, search, diffMap }
  },
  template: `
<div v-loading="loading">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
    <h2>📚 知识库</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <el-input v-model="query" placeholder="搜索..." size="small" style="width:200px" @keyup.enter="search" clearable />
      <el-button type="primary" size="small" @click="search">搜索</el-button>
    </div>
  </div>

  <el-tabs v-model="tab" @tab-change="search">
    <el-tab-pane label="📖 法规条文" name="regulations">
      <div v-if="regulations.length===0" style="text-align:center;padding:40px;color:#94a3b8">暂无结果</div>
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

    <el-tab-pane label="💡 整改案例" name="cases">
      <div v-if="cases.length===0" style="text-align:center;padding:40px;color:#94a3b8">暂无结果</div>
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
