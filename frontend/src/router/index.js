import { createRouter, createWebHashHistory } from 'vue-router'
import Login from '../views/auth/Login.js'
import Layout from '../views/Layout.js'
import Dashboard from '../views/dashboard/Index.js'
import Standards from '../views/standards/Index.js'
import AdminTenants from '../views/admin/Tenants.js'
import AdminDepartments from '../views/admin/Departments.js'
import AdminUsers from '../views/admin/Users.js'
import AssessmentList from '../views/assessment/List.js'
import AssessmentDetail from '../views/assessment/Detail.js'
import SnapshotList from '../views/snapshots/Index.js'
import SnapshotDetail from '../views/snapshots/Detail.js'
import TaskList from '../views/tasks/List.js'
import TaskDetail from '../views/tasks/Detail.js'
import ReportsIndex from '../views/reports/Index.js'
import HRLayout from '../views/hospital-rating/Layout.js'
import HRDashboard from '../views/hospital-rating/Dashboard.js'
import HRRatingForm from '../views/hospital-rating/RatingForm.js'
import HRReportView from '../views/hospital-rating/ReportView.js'
import HRStandardManage from '../views/hospital-rating/StandardManage.js'

const R = (roles) => ({ roles })
const ALL = R(['admin', 'director', 'expert', 'dept_head', 'leader'])
const STAFF = R(['admin', 'director', 'expert', 'dept_head'])
const REVIEWER = R(['admin', 'director', 'expert'])
const ADMIN = R(['admin'])

const routes = [
  { path: '/login', name: 'Login', component: Login, meta: { public: true } },
  {
    path: '/',
    component: Layout,
    children: [
      { path: '', redirect: '/hospital-rating/dashboard' },
      { path: 'dashboard', name: 'Dashboard', component: Dashboard, meta: { title: '综合仪表盘', ...ALL } },
      { path: 'assessments', name: 'Assessments', component: AssessmentList, meta: { title: '评级填报', ...STAFF } },
      { path: 'assessments/:id', name: 'AssessmentDetail', component: AssessmentDetail, meta: { title: '填报详情', ...STAFF } },
      { path: 'snapshots', name: 'Snapshots', component: SnapshotList, meta: { title: '评估快照', ...REVIEWER } },
      { path: 'snapshots/:id', name: 'SnapshotDetail', component: SnapshotDetail, meta: { title: '快照详情', ...ALL } },
      { path: 'tasks', name: 'Tasks', component: TaskList, meta: { title: '整改任务', ...STAFF } },
      { path: 'tasks/:id', name: 'TaskDetail', component: TaskDetail, meta: { title: '任务详情', ...STAFF } },
      { path: 'reports', name: 'Reports', component: ReportsIndex, meta: { title: '报告管理', ...REVIEWER } },
      { path: 'admin/tenants', name: 'AdminTenants', component: AdminTenants, meta: { title: '租户管理', ...ADMIN, platformOnly: true } },
      { path: 'admin/users', name: 'AdminUsers', component: AdminUsers, meta: { title: '用户管理', ...ADMIN } },
      { path: 'admin/standards', name: 'AdminStandards', component: Standards, meta: { title: '标准库管理', ...ADMIN } },
      { path: 'admin/departments', name: 'AdminDepartments', component: AdminDepartments, meta: { title: '科室管理', ...ADMIN } },
      {
        path: '/hospital-rating',
        component: HRLayout,
        children: [
          { path: '', redirect: '/hospital-rating/dashboard' },
          { path: 'dashboard', name: 'HRDashboard', component: HRDashboard, meta: { title: '综合仪表盘', ...ALL } },
          { path: 'form', name: 'HRRatingForm', component: HRRatingForm, meta: { title: '数据填报', ...STAFF } },
          { path: 'reports', name: 'HRReports', component: HRReportView, meta: { title: '评级报告', ...ALL } },
          { path: 'standards', name: 'HRStandards', component: HRStandardManage, meta: { title: '标准库管理', ...ADMIN } },
        ],
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

const roleLabels = { admin: '管理员', director: '院长', expert: '评级专家', dept_head: '科室负责人', leader: '院领导' }

router.beforeEach(async (to, _from, next) => {
  // Allow public pages
  if (to.meta.public) return next()

  // Must be logged in
  const token = localStorage.getItem('token')
  if (!token) return next('/login')

  // Role check
  if (to.meta.roles && to.meta.roles.length > 0) {
    // Fetch user info from local store (set by auth store after login)
    const userStr = localStorage.getItem('user')
    const user = userStr ? JSON.parse(userStr) : null
    const role = user?.role || ''

    if (!to.meta.roles.includes(role)) {
      // Redirect to dashboard if no permission
      console.warn(`Access denied: ${role} cannot access ${to.path}`)
      return next('/dashboard')
    }
  }

  next()
})

export default router
