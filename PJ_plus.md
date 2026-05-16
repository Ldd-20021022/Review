# PJ_plus — 医院评级系统分步实施方案

> 基于 PJ.md 的详细设计，在当前技术栈（FastAPI + Vue3 + SQLAlchemy）上逐步落地。
> 每步包含：目标 → 后端改动 → 前端改动 → 验证方式。

---

## 现状与 PJ.md 差距分析

| PJ.md 概念 | 当前系统对应 | 差距 |
|---|---|---|
| rating_categories | std_categories | 缺少 `weight` 权重字段 |
| rating_indicators | std_indicators + std_requirements | 缺少 `standard_value`/`unit`/`indicator_type`/`weight`/`max_score`，合规判断逻辑分散在 requirement 层级 |
| rating_submissions | assessments | 缺少 `department_id`/`rating_cycle`/`submitter_id` 等科室填报上下文 |
| rating_submission_details | assessment_items | 缺少 `actual_value`/`is_compliant` 字段，目前只存 score |
| review_records | 无 | **需要新建**，记录院长的审批/退回操作 |
| notifications | 无 | **需要新建**，站内消息通知 |
| 达标自动判定 | 无 | **需要新建** compliance 服务 |
| 院长仪表盘 | dashboard 接口 | 需要改造为 PJ.md 风格（卡牌统计 + 科室表格 + 退回按钮） |

---

## Step 1: 数据库模型对齐

### 1.1 扩展 std_indicators 表

给 `StdIndicator` 模型增加 PJ.md 中定义的字段：

```python
# 新增字段
standard_value: str   # 达标值，如 "≤0.8%"
unit: str             # 单位，如 "%"
max_score: int        # 满分，默认 100
weight: Decimal       # 权重
indicator_type: str   # numeric_less_equal / numeric_greater_equal / numeric_equal / numeric_range / yesno
```

### 1.2 给 std_categories 增加 weight 字段

### 1.3 扩展 assessments 表

```python
# 新增字段
department_id: int    # FK → departments，科室负责人提交的科室
rating_cycle: str     # "2024-Q1" / "2024年度"
submitter_id: int     # FK → users，提交人
total_score: Decimal  # 自动计算的总分
```

### 1.4 扩展 assessment_items 表

```python
# 新增字段
actual_value: str     # 科室填的实际值
is_compliant: bool    # 是否达标（系统自动判断）
```

### 1.5 新建 review_records 表

```python
class ReviewRecord(Base):
    submission_id: int   # FK → assessments
    reviewer_id: int     # FK → users (院长)
    action: str          # "approved" / "rejected"
    feedback: str        # 退回意见
    reviewed_at: datetime
```

### 1.6 新建 notifications 表

```python
class Notification(Base):
    user_id: int
    title: str
    content: str
    type: str           # system / reject / approve
    is_read: bool
    related_id: int     # 关联的 submission_id
    created_at: datetime
```

### 验证

- [ ] `curl /api/standards/indicators` 返回新字段
- [ ] 创建 assessment 时可关联 department 和 rating_cycle

---

## Step 2: 达标判定核心算法

### 2.1 后端新建 `app/services/compliance.py`

移植 PJ.md 第 4 节的 `ComplianceService`：

```
checkCompliance(actual_value, standard_value, indicator_type) → { is_compliant, score }
calculateTotalScore(details) → float
generateReport(submission) → dict
```

支持 5 种判定类型：
- `numeric_less_equal` — 实际值 ≤ 标准值
- `numeric_greater_equal` — 实际值 ≥ 标准值
- `numeric_equal` — 实际值 = 标准值
- `numeric_range` — 实际值在区间内
- `yesno` — 是/否判定

### 2.2 打分时自动触发判定

修改 `POST /api/assessments/{aid}/items/{iid}` 接口：当更新 `actual_value` 时，自动调用 `checkCompliance` 填充 `is_compliant` 和 `score`。

### 验证

- [ ] Python 单元测试：输入实际值 + 标准值 + 类型，验证判定结果
- [ ] 通过 API 更新 actual_value 后，is_compliant 自动计算

---

## Step 3: 科室数据填报功能

### 3.1 后端改造

- `POST /api/assessments/` 改为科室负责人可调用（当前仅 admin/expert）
- `GET /api/assessments/my-department` 新增：查看本科室的评级状态和历史
- `PUT /api/assessments/{id}/submit` 新增：科室提交审核（status: draft → submitted）

### 3.2 前端页面：科室数据填报页

按照 PJ.md 7.2 节设计：
- 按分类分组展示指标
- 每行：指标名称 | 标准值 | 输入框（填实际值）| 达标状态（✅/❌）
- 实时显示当前总分和达标率
- 保存草稿 + 提交审核按钮

### 验证

- [ ] 科室负责人登录后看到填报页面
- [ ] 填写数据后实时显示达标状态
- [ ] 提交后状态变更为 submitted

---

## Step 4: 院长仪表盘 + 审核流程

### 4.1 后端改造

重写 `GET /api/dashboard/overview`：
```json
{
  "total_departments": 10,
  "approved": 5,
  "rejected": 3,
  "pending": 2,
  "average_score": 85.6,
  "departments": [
    { "id": 1, "name": "急诊科", "score": 92.0, "status": "approved", "non_compliant_count": 0 }
  ]
}
```

### 4.2 前端页面：院长仪表盘

按照 PJ.md 7.1 节设计：
- 顶部 4 个统计卡牌（全院均分 / 已达标 / 未达标 / 待提交）
- 科室评级状态表格：科室名 | 总分 | 达标率 | 状态 | 未达标项数 | 操作（查看 / 退回）
- 退回按钮：点击弹出退回弹窗（PJ.md 7.3 节设计）

### 4.3 退回弹窗

- 显示科室名、当前得分、未达标项列表
- 退回意见输入框（必填）
- 确认退回 → 调用 API → 通知科室负责人

### 验证

- [ ] 院长登录看到全院仪表盘
- [ ] 点击退回 → 弹窗 → 输入意见 → 确认 → 状态变为 rejected
- [ ] 科室负责人收到通知

---

## Step 5: 退回 + 整改 + 通知闭环

### 5.1 后端：退回/通过接口

```
POST /api/assessments/{id}/approve   → status → approved, 记录 review_record, 发通知
POST /api/assessments/{id}/reject    → status → rejected, 记录 review_record + feedback, 发通知
```

### 5.2 后端：整改重提交

```
PUT /api/assessments/{id}/revise     → status → revising
PUT /api/assessments/{id}/resubmit   → status → submitted (重新进入审核)
```

### 5.3 通知系统

- 院长操作时自动创建 notification
- `GET /api/notifications` 返回当前用户的通知列表
- `PATCH /api/notifications/{id}/read` 标记已读
- 前端 Layout 顶栏显示未读通知数量

### 5.4 前端：科室负责人通知/整改流程

- 收到退回通知后，在填报页看到院长意见
- 修改数据后重新提交
- 状态流转可视化展示

### 验证

- [ ] 退回 → 科室负责人看到通知
- [ ] 科室修改后重新提交 → 院长再次审核
- [ ] 全流程状态流转正确

---

## Step 6: PDF 报告 + 联调完善

### 6.1 PDF 导出（已有基础）

- 科室报告：达标/未达标明细表
- 全院报告：各科室汇总 + 统计
- 使用 WeasyPrint 渲染 HTML 模板

### 6.2 全流程联调

- 科室负责人填报 → 提交 → 院长仪表盘查看 → 退回/通过 → 整改重提 → 全流程走通
- 权限边界检查（科室负责人只能看自己科室数据）
- 中文编码和日期格式统一

---

## 执行顺序

```
Step 1 (数据库) → Step 2 (算法) → Step 3 (填报) → Step 4 (仪表盘) → Step 5 (退回闭环) → Step 6 (报告+联调)
```

每一步完成后验证通过再进入下一步。现在从 Step 1 开始。

---

## 实施完成总结 (2026-05-14)

### 后端改动清单

| 文件 | 改动 |
|---|---|
| `models/standard.py` | StdCategory 加 `weight`；StdIndicator 加 `standard_value`/`unit`/`max_score`/`weight`/`indicator_type` |
| `models/assessment.py` | Assessment 加 `department_id`/`rating_cycle`/`submitter_id`/`total_score`/`submitted_at`；AssessmentItem 加 `actual_value`/`is_compliant` |
| `models/review.py` | **新建** ReviewRecord 表 |
| `models/notification.py` | **新建** Notification 表 |
| `models/__init__.py` | 导出新模型 |
| `schemas/standard.py` | 增加新字段到 IndicatorInfo/IndicatorCreate/CategoryCreate |
| `schemas/assessment.py` | 增加新字段到 AssessmentCreate/Info/Detail/ItemInfo/ScoreUpdate |
| `services/compliance.py` | **新建** 达标判定核心算法 (5种类型) |
| `api/assessments.py` | 更新 create/submit/resubmit/my-department；score → actual_value + auto compliance |
| `api/reviews.py` | **新建** approve/reject 接口 + 通知联动 |
| `api/notifications.py` | **新建** 通知列表/标记已读/未读数 |
| `api/dashboard.py` | 新增 `GET /director` 院长综合仪表盘 |
| `main.py` | 注册 reviews + notifications 路由 |

### 前端改动清单

| 文件 | 改动 |
|---|---|
| `api/assessments.js` | 增加 myDepartment/submit/resubmit/approve/reject |
| `api/dashboard.js` | 增加 getDirectorDashboard |
| `api/notifications.js` | **新建** 通知 API 封装 |
| `views/assessment/List.js` | 重写：支持 dept_head 视图 + 评级周期 + 总分显示 |
| `views/assessment/Detail.js` | 重写：actual_value 输入 + 自动达标标识(✅/❌) + 提交/整改 |
| `views/dashboard/Index.js` | 重写：PJ.md 院长仪表盘 (4卡牌 + 科室表 + 退回弹窗) |
| `views/Layout.js` | 更新：通知铃铛 + 菜单权限 + 角色标签 |
| `router/index.js` | 更新：加入 director 角色，dept_head 可访问评估页 |

### E2E 验证结果

```
科室负责人(dept1) → 我的科室评估(ID:1) → 填写 "0.6%" → ✅ 达标(100分)
→ 提交 → total_score: 100.00, status: submitted
→ 院长退回 "Please fix..." → status: rejected
→ 科室收到通知: "[reject] ⚠️ 您的科室评级未通过，已被退回"
→ 院长仪表盘: 急诊科 rejected, 其余5科室 not_submitted ✅
```

### 测试账号

| 角色 | 手机号 | 密码 |
|---|---|---|
| 院长 | director | 123456 |
| 科室负责人 | dept1 ~ dept6 | 123456 |
| 管理员 | admin | admin123 |

### 启动方式

```bash
# 后端
cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 前端 (CDN模式，无需构建)
cd frontend && python -m http.server 5173 --bind 0.0.0.0

# 初始化数据
cd backend && PYTHONIOENCODING=utf-8 python seed.py
```
