import { defineComponent, ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from '/src/shim/element-plus.js'
import {
  listCategories, createCategory, updateCategory, deleteCategory,
  listIndicators, createIndicator, deleteIndicator, getIndicator, updateRequirements,
  importExcel
} from '../../api/standards.js'

export default defineComponent({
  name: 'StandardsManagement',
  setup() {
    const categories = ref([])
    const selectedCat = ref(null)
    const indicators = ref([])
    const loading = ref(false)

    // Category dialog
    const catDialog = ref(false)
    const catForm = ref({ name: '', code: '', parent_id: null, sort_order: 0 })
    const editingCat = ref(null)

    // Indicator dialog
    const indDialog = ref(false)
    const indForm = ref({ category_id: null, code: '', name: '', sort_order: 0 })
    const req4 = ref('')
    const req5 = ref('')
    const req6 = ref('')

    // View indicator detail
    const viewDialog = ref(false)
    const viewIndicator = ref(null)

    // Import
    const importDialog = ref(false)

    async function fetchCategories() {
      const data = await listCategories()
      categories.value = data || []
    }

    async function onCatSelect(cat) {
      selectedCat.value = cat
      indicators.value = []
      if (cat) {
        loading.value = true
        indicators.value = await listIndicators(cat.id) || []
        loading.value = false
      }
    }

    // Category actions
    function openCatDialog(cat = null) {
      editingCat.value = cat
      if (cat) {
        catForm.value = { name: cat.name, code: cat.code, parent_id: cat.parent_id, sort_order: cat.sort_order }
      } else {
        catForm.value = { name: '', code: '', parent_id: selectedCat.value?.id || null, sort_order: 0 }
      }
      catDialog.value = true
    }

    async function saveCat() {
      if (editingCat.value) {
        await updateCategory(editingCat.value.id, catForm.value)
      } else {
        await createCategory(catForm.value)
      }
      catDialog.value = false
      await fetchCategories()
      ElMessage.success('保存成功')
    }

    async function removeCat(cat) {
      await ElMessageBox.confirm('删除分类将同时删除其子分类和指标，确认？', '警告', { type: 'warning' })
      await deleteCategory(cat.id)
      await fetchCategories()
      if (selectedCat.value?.id === cat.id) selectedCat.value = null
      ElMessage.success('已删除')
    }

    // Indicator actions
    function openIndDialog() {
      if (!selectedCat.value) { ElMessage.warning('请先选择分类'); return }
      indForm.value = { category_id: selectedCat.value.id, code: '', name: '', sort_order: 0 }
      req4.value = ''; req5.value = ''; req6.value = ''
      indDialog.value = true
    }

    async function saveInd() {
      const requirements = []
      if (req4.value) requirements.push({ level: 4, requirement_text: req4.value })
      if (req5.value) requirements.push({ level: 5, requirement_text: req5.value })
      if (req6.value) requirements.push({ level: 6, requirement_text: req6.value })
      await createIndicator({ ...indForm.value, requirements })
      indDialog.value = false
      await onCatSelect(selectedCat.value)
      ElMessage.success('指标创建成功')
    }

    async function removeInd(ind) {
      await ElMessageBox.confirm('确认删除该指标？', '警告', { type: 'warning' })
      await deleteIndicator(ind.id)
      await onCatSelect(selectedCat.value)
      ElMessage.success('已删除')
    }

    async function viewInd(ind) {
      viewIndicator.value = await getIndicator(ind.id)
      viewDialog.value = true
    }

    // Import
    const importFile = ref(null)
    const importing = ref(false)
    function onFileChange(e) {
      importFile.value = e.target.files[0]
    }
    async function doImport() {
      if (!importFile.value) return
      importing.value = true
      try {
        const res = await importExcel(importFile.value)
        ElMessage.success(`导入成功，共 ${res.count} 条指标`)
        importDialog.value = false
        await fetchCategories()
      } catch (e) {
        ElMessage.error('导入失败: ' + e.message)
      } finally {
        importing.value = false
      }
    }

    onMounted(fetchCategories)

    return {
      categories, selectedCat, indicators, loading,
      catDialog, catForm, editingCat, openCatDialog, saveCat, removeCat, onCatSelect,
      indDialog, indForm, req4, req5, req6, openIndDialog, saveInd, removeInd, viewInd,
      viewDialog, viewIndicator,
      importDialog, importFile, importing, onFileChange, doImport,
    }
  },
  template: `
<div>
  <h3 style="margin-bottom:16px">标准库管理</h3>

  <el-row :gutter="20">
    <!-- Left: Category tree -->
    <el-col :span="8">
      <el-card>
        <template #header>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span>分类目录</span>
            <div>
              <el-button size="small" type="primary" @click="openCatDialog()">新增</el-button>
              <el-button size="small" @click="importDialog = true">Excel导入</el-button>
            </div>
          </div>
        </template>
        <el-tree
          :data="categories"
          :props="{ children: 'children', label: 'name' }"
          node-key="id"
          highlight-current
          @node-click="onCatSelect"
        >
          <template #default="{ data }">
            <span style="flex:1">{{ data.name }} <small style="color:#999">({{ data.code }})</small></span>
            <span>
              <el-button link size="small" @click.stop="openCatDialog(data)">编辑</el-button>
              <el-button link size="small" @click.stop="removeCat(data)" style="color:#f56c6c">删除</el-button>
            </span>
          </template>
        </el-tree>
      </el-card>
    </el-col>

    <!-- Right: Indicators -->
    <el-col :span="16">
      <el-card>
        <template #header>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span>{{ selectedCat ? selectedCat.name + ' - 指标列表' : '请选择分类' }}</span>
            <el-button v-if="selectedCat" size="small" type="primary" @click="openIndDialog">新增指标</el-button>
          </div>
        </template>
        <el-table :data="indicators" v-loading="loading" stripe>
          <el-table-column prop="code" label="编号" width="100" />
          <el-table-column prop="name" label="指标名称" />
          <el-table-column label="操作" width="160">
            <template #default="{ row }">
              <el-button link size="small" @click="viewInd(row)">查看</el-button>
              <el-button link size="small" @click="removeInd(row)" style="color:#f56c6c">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </el-col>
  </el-row>

  <!-- Category dialog -->
  <el-dialog v-model="catDialog" :title="editingCat ? '编辑分类' : '新增分类'" width="500px">
    <el-form :model="catForm" label-width="80px">
      <el-form-item label="名称"><el-input v-model="catForm.name" /></el-form-item>
      <el-form-item label="编码"><el-input v-model="catForm.code" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="catForm.sort_order" :min="0" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="catDialog = false">取消</el-button>
      <el-button type="primary" @click="saveCat">保存</el-button>
    </template>
  </el-dialog>

  <!-- Indicator dialog -->
  <el-dialog v-model="indDialog" title="新增指标" width="600px">
    <el-form :model="indForm" label-width="80px">
      <el-form-item label="编号"><el-input v-model="indForm.code" /></el-form-item>
      <el-form-item label="名称"><el-input v-model="indForm.name" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="indForm.sort_order" :min="0" /></el-form-item>
      <el-divider>级别要求</el-divider>
      <el-form-item label="4级要求"><el-input v-model="req4" type="textarea" :rows="2" /></el-form-item>
      <el-form-item label="5级要求"><el-input v-model="req5" type="textarea" :rows="2" /></el-form-item>
      <el-form-item label="6级要求"><el-input v-model="req6" type="textarea" :rows="2" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="indDialog = false">取消</el-button>
      <el-button type="primary" @click="saveInd">保存</el-button>
    </template>
  </el-dialog>

  <!-- View indicator dialog -->
  <el-dialog v-model="viewDialog" title="指标详情" width="600px">
    <template v-if="viewIndicator">
      <p><strong>编号：</strong>{{ viewIndicator.code }}</p>
      <p><strong>名称：</strong>{{ viewIndicator.name }}</p>
      <el-divider>级别要求</el-divider>
      <div v-for="r in viewIndicator.requirements" :key="r.level">
        <p><strong>{{ r.level }}级：</strong>{{ r.requirement_text }}</p>
      </div>
    </template>
  </el-dialog>

  <!-- Import dialog -->
  <el-dialog v-model="importDialog" title="Excel 导入标准" width="450px">
    <p style="margin-bottom:12px;color:#909399">Excel 格式：一级分类 | 二级分类 | 指标编号 | 指标名称 | 4级要求 | 5级要求 | 6级要求</p>
    <el-upload drag :auto-upload="false" :on-change="onFileChange" :limit="1" accept=".xlsx">
      <el-icon><i class="el-icon-upload"></i></el-icon>
      <div>拖拽或点击上传 Excel</div>
    </el-upload>
    <template #footer>
      <el-button @click="importDialog = false">取消</el-button>
      <el-button type="primary" :loading="importing" @click="doImport">开始导入</el-button>
    </template>
  </el-dialog>
</div>
`,
})
