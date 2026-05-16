# 编码规范

## 后端 (Python FastAPI)

### 文件组织
- models/   — 纯表定义，不含业务逻辑
- schemas/  — Pydantic，与 models 一一对应（如需要不同视图则多个 schema）
- api/      — 薄层路由，参数校验 → 调用 service → 返回
- services/ — 业务逻辑（跨多表操作放这里）
- utils/    — 纯函数工具

### 代码风格
- 所有函数添加类型注解
- 使用 `async def` + `await`
- DB session 通过 `Depends(get_db)` 注入
- 租户过滤通过 `Depends(get_current_tenant_id)` 注入
- 角色权限通过 `Depends(require_role("expert"))` 检查
- 不写 docstring；函数名和类型注解已足够

### 错误处理
- 使用 HTTPException 返回标准错误
- 404: 资源不存在
- 403: 权限不足
- 400: 参数校验失败（Pydantic 自动处理）

## 前端 (Vue 3 + Element Plus)

### 文件组织
- views/     — 页面级组件，对应路由
- components/ — 可复用组件（跨页面使用3次以上才抽取）
- stores/    — Pinia，按模块分文件（auth, assessment, task）
- api/       — Axios 封装，一个模块一个文件

### 代码风格
- 使用 `<script setup lang="ts">`（初期可用 JS，后期加 TS）
- 组件名采用 PascalCase
- 路由名采用 kebab-case
- API 调用必须通过 api/ 层，不直接在组件中用 axios

### 状态管理
- 登录用户信息 → stores/auth.js
- 当前租户上下文 → stores/tenant.js
- 其余页面状态尽量用组件内 ref/reactive

### Element Plus
- 中文语言包全局配置
- 表格用 el-table + 分页用 el-pagination
- 树控件用 el-tree（标准分类）
- 表单校验用 el-form rules
