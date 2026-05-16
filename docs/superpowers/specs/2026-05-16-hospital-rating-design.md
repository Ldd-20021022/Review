# 三甲医院评级系统 — 设计说明书

## 项目定位

三甲医院评级系统，帮助三甲医院保级、二甲医院升级。包含 233 项评审指标，电子病历（EMR）评级为其中一项。

## 技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 代码位置 | 合并入 PJ_pro | 复用用户/科室/权限/通知等基础设施 |
| 后端 | Python FastAPI + SQLAlchemy | 与 PJ_pro 一致 |
| 前端 | Vue 3 + Element Plus | 与 PJ_pro 一致 |
| 数据库 | 现有 SQLite，仅加 `standard_sets` 表 | 最小改动 |
| 登录 | 完全复用 PJ_pro JWT 认证 | 不重复开发 |

## 数据库变更

```
standard_sets (新建)
  id, name, type, created_at

std_categories 加 set_id FK → standard_sets
assessments 加 set_id FK → standard_sets
```

其余表（std_indicators, std_requirements, assessment_items, review_records, notifications）直接复用。

## MVP 功能范围

1. 标准库管理 — 三甲评审指标 CRUD + Excel 导入
2. 科室数据填报 — 分组折叠表格，逐项填写实际值，实时达标判定
3. 院长仪表盘 — 统计卡片 + 科室列表表格，全院评级状态一览
4. 对比报告 — 达标/未达标明细，红色标记不达标项
5. 退回/通过 — 院长一键退回（填写意见），科室收到通知
6. 整改重提 — 科室根据退回意见修改后重新提交

## 页面设计

### 整体布局
- 侧边栏导航（深色背景，200px 宽）
- 顶部操作栏（通知 + 用户头像）
- 内容区宽屏展示

### 菜单结构
- 📊 综合仪表盘
- 📋 数据填报
- 📄 评级报告
- 📐 标准库管理
- ⚙️ 科室管理
- 👥 用户管理

### 院长仪表盘
- 4 个统计卡片（全院均分 / 已达标 / 未达标 / 待提交）
- 科室列表表格（科室名、总分、达标率、状态、未达标项数、操作按钮）
- 未达标科室行标红，⭐ 退回按钮醒目

### 科室填报页
- 按指标分类分组折叠
- 每个分类内嵌表格：指标名称 | 标准值 | 实际值输入框 | 达标状态（绿勾/红叉）
- 底部固定栏：总分预估 + 达标率 + 未达标项数 + 保存草稿/提交审核按钮

### 退回弹窗
- 展示科室名、当前得分、未达标项列表
- 必填退回意见文本框
- 确认后显示成功反馈 + 通知已发送提示

## 后端新增文件

```
backend/app/
├── models/standard_set.py       # StandardSet 模型
├── api/hospital_ratings.py      # /api/hospital-ratings 路由
└── services/hospital_rating.py  # 三甲评级业务逻辑
```

## 前端新增文件

```
frontend/src/views/hospital-rating/
├── Dashboard.vue          # 院长仪表盘
├── RatingForm.vue         # 科室数据填报
├── ComparisonReport.vue   # 对比报告
├── StandardManage.vue     # 标准库管理
└── components/
    ├── RejectModal.vue    # 退回弹窗
    └── StatCard.vue       # 统计卡片
```

## 后端 API

```
GET    /api/hospital-ratings/dashboard        # 院长仪表盘数据
GET    /api/hospital-ratings/departments       # 科室评级状态列表
POST   /api/hospital-ratings/submit            # 提交评级数据
GET    /api/hospital-ratings/my-department     # 我的科室数据
GET    /api/hospital-ratings/report/:id        # 查看报告
POST   /api/hospital-ratings/:id/approve       # 院长通过
POST   /api/hospital-ratings/:id/reject        # 院长退回
PUT    /api/hospital-ratings/submit/:id        # 整改重提交
GET    /api/hospital-ratings/standards         # 标准库管理
POST   /api/hospital-ratings/standards/import  # Excel 导入
```
