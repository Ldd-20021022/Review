import { defineComponent, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from '/src/shim/element-plus.js'
import { getTask, startTask, submitTask, acceptTask, returnTask, updateTask, addComment } from '../../api/tasks.js'

export default defineComponent({
  name: 'TaskDetail',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const task = ref(null)
    const loading = ref(false)

    // Comment
    const commentText = ref('')
    const commentLoading = ref(false)

    // Return reason
    const returnDialog = ref(false)
    const returnReason = ref('')

    const statusMap = { pending: '待开始', in_progress: '进行中', submitted: '已提交', accepted: '已验收', returned: '退回' }
    const statusType = { pending: 'info', in_progress: 'warning', submitted: '', accepted: 'success', returned: 'danger' }

    async function fetch() {
      loading.value = true
      try { task.value = await getTask(route.params.id) }
      finally { loading.value = false }
    }

    async function doAction(action) {
      try {
        let fn = { start: startTask, submit: submitTask, accept: acceptTask }[action]
        if (!fn) return
        const res = await fn(task.value.id)
        task.value = { ...task.value, ...res }
        ElMessage.success('操作成功')
      } catch (e) {
        ElMessage.error(e.message)
      }
    }

    async function doReturn() {
      try {
        const res = await returnTask(task.value.id, returnReason.value)
        task.value = { ...task.value, ...res }
        returnDialog.value = false
        ElMessage.success('已退回')
      } catch (e) {
        ElMessage.error(e.message)
      }
    }

    async function doComment() {
      if (!commentText.value.trim()) return
      commentLoading.value = true
      try {
        await addComment(task.value.id, commentText.value)
        commentText.value = ''
        await fetch() // Refresh to get new comments
      } catch (e) {
        ElMessage.error(e.message)
      } finally {
        commentLoading.value = false
      }
    }

    function goBack() { router.push('/tasks') }

    onMounted(fetch)

    return { task, loading, commentText, commentLoading, doComment, doAction, doReturn,
      returnDialog, returnReason, goBack, statusMap, statusType }
  },
  template: `
<div v-loading="loading">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div>
      <el-button text @click="goBack">&larr; 返回</el-button>
      <h3 style="display:inline">{{ task?.title }}</h3>
      <el-tag :type="statusType[task?.status]" style="margin-left:12px">{{ statusMap[task?.status] }}</el-tag>
    </div>
    <div>
      <el-button v-if="task?.status === 'pending'" type="primary" size="small" @click="doAction('start')">开始处理</el-button>
      <el-button v-if="task?.status === 'in_progress'" type="primary" size="small" @click="doAction('submit')">提交完成</el-button>
      <el-button v-if="task?.status === 'submitted'" type="success" size="small" @click="doAction('accept')">验收通过</el-button>
      <el-button v-if="task?.status === 'submitted'" type="danger" size="small" @click="returnDialog = true">退回</el-button>
    </div>
  </div>

  <el-card style="margin-bottom:16px" v-if="task">
    <el-descriptions :column="3" border>
      <el-descriptions-item label="评估项目">{{ task.assessment_name }}</el-descriptions-item>
      <el-descriptions-item label="责任科室">{{ task.dept_name }}</el-descriptions-item>
      <el-descriptions-item label="负责人">{{ task.assignee_name || '未指定' }}</el-descriptions-item>
      <el-descriptions-item label="关联指标">{{ task.indicator_code }} {{ task.indicator_name }}</el-descriptions-item>
      <el-descriptions-item label="目标级别">{{ task.target_level }}级</el-descriptions-item>
      <el-descriptions-item label="优先级">
        <el-tag :type="task.priority === 'high' || task.priority === 'urgent' ? 'danger' : task.priority === 'medium' ? 'warning' : 'info'" size="small">{{ task.priority }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="截止日期">{{ task.due_date || '未设置' }}</el-descriptions-item>
      <el-descriptions-item label="创建时间">{{ task.created_at?.slice(0,19) }}</el-descriptions-item>
      <el-descriptions-item label="最后更新">{{ task.updated_at?.slice(0,19) || '-' }}</el-descriptions-item>
      <el-descriptions-item label="差距描述" :span="3">{{ task.gap_desc || '无' }}</el-descriptions-item>
    </el-descriptions>
  </el-card>

  <!-- Comments -->
  <el-card>
    <template #header><span>反馈记录 ({{ task?.comments?.length || 0 }})</span></template>
    <div v-for="c in task?.comments || []" :key="c.id"
      style="padding:12px 0;border-bottom:1px solid #eee">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <strong>{{ c.user_name }}</strong>
        <span style="font-size:12px;color:#999">{{ c.created_at?.slice(0,19) }}</span>
      </div>
      <div>{{ c.content }}</div>
    </div>
    <div v-if="!task?.comments?.length" style="color:#999;text-align:center;padding:24px">暂无反馈记录</div>

    <div style="display:flex;gap:8px;margin-top:16px">
      <el-input v-model="commentText" placeholder="添加反馈..." style="flex:1" />
      <el-button type="primary" :loading="commentLoading" @click="doComment">发送</el-button>
    </div>
  </el-card>

  <!-- Return dialog -->
  <el-dialog v-model="returnDialog" title="退回原因" width="400px">
    <el-input v-model="returnReason" type="textarea" :rows="3" placeholder="请输入退回原因" />
    <template #footer>
      <el-button @click="returnDialog = false">取消</el-button>
      <el-button type="danger" @click="doReturn">确认退回</el-button>
    </template>
  </el-dialog>
</div>
`,
})
