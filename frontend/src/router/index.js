import { createRouter, createWebHashHistory } from 'vue-router'
import Login from '../views/auth/Login.js'
import HRLayout from '../views/hospital-rating/Layout.js'
import HRDashboard from '../views/hospital-rating/Dashboard.js'
import HRRatingForm from '../views/hospital-rating/RatingForm.js'
import HRReportView from '../views/hospital-rating/ReportView.js'
import HRStandardManage from '../views/hospital-rating/StandardManage.js'
import HRProfile from '../views/hospital-rating/Profile.js'
import HRKnowledge from '../views/hospital-rating/Knowledge.js'
import HRWorkflow from '../views/hospital-rating/Workflow.js'
import AdminDepartments from '../views/admin/Departments.js'
import AdminUsers from '../views/admin/Users.js'
import AdminAuditLog from '../views/admin/AuditLog.js'
import AdminTenants from '../views/admin/Tenants.js'
import AdminSettings from '../views/admin/Settings.js'

const R = (roles) => ({ roles })
const ALL = R(['admin', 'director', 'expert', 'dept_head', 'leader'])
const STAFF = R(['admin', 'director', 'expert', 'dept_head'])
const ADMIN = R(['admin'])

const routes = [
  { path: '/login', name: 'Login', component: Login, meta: { public: true } },
  {
    path: '/',
    component: HRLayout,
    children: [
      { path: '', redirect: '/hospital-rating/dashboard' },
      { path: 'hospital-rating/dashboard', name: 'HRDashboard', component: HRDashboard, meta: { title: '综合仪表盘', ...ALL } },
      { path: 'hospital-rating/form', name: 'HRRatingForm', component: HRRatingForm, meta: { title: '数据填报', ...STAFF } },
      { path: 'hospital-rating/reports', name: 'HRReports', component: HRReportView, meta: { title: '评级报告', ...ALL } },
      { path: 'hospital-rating/standards', name: 'HRStandards', component: HRStandardManage, meta: { title: '标准库管理', ...ADMIN } },
      { path: 'admin/departments', name: 'AdminDepartments', component: AdminDepartments, meta: { title: '科室管理', ...ADMIN } },
      { path: 'admin/users', name: 'AdminUsers', component: AdminUsers, meta: { title: '用户管理', ...ADMIN } },
      { path: 'admin/audit-log', name: 'AdminAuditLog', component: AdminAuditLog, meta: { title: '审计日志', ...ADMIN } },
      { path: 'admin/tenants', name: 'AdminTenants', component: AdminTenants, meta: { title: '医院管理', ...ADMIN } },
      { path: 'admin/settings', name: 'AdminSettings', component: AdminSettings, meta: { title: '系统设置', ...ADMIN } },
      { path: 'hospital-rating/knowledge', name: 'HRKnowledge', component: HRKnowledge, meta: { title: '知识库', ...ALL } },
      { path: 'hospital-rating/workflow', name: 'HRWorkflow', component: HRWorkflow, meta: { title: '质量改进', ...STAFF } },
      { path: 'hospital-rating/profile', name: 'HRProfile', component: HRProfile, meta: { title: '个人中心', ...ALL } },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(async (to, _from, next) => {
  if (to.meta.public) return next()

  const token = localStorage.getItem('token')
  if (!token) return next('/login')

  if (to.meta.roles && to.meta.roles.length > 0) {
    const userStr = localStorage.getItem('user')
    const user = userStr ? JSON.parse(userStr) : null
    const role = user?.role || ''
    if (!to.meta.roles.includes(role)) {
      return next('/hospital-rating/dashboard')
    }
  }

  next()
})

export default router
