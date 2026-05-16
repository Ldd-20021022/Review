# API 接口设计

## 通用约定

- 请求/响应格式：JSON
- 认证：Header `Authorization: Bearer <jwt_token>`
- 租户上下文：从 JWT 中提取，非超管用户必须绑定租户
- 分页：`?page=1&page_size=20`，响应含 `{ items, total, page, page_size }`

## 认证

```
POST /api/auth/login         body: {phone, password}  → {access_token, user}
GET  /api/auth/me             → {id, name, phone, role, tenant_id, dept_id}
```

## 租户管理（超管）

```
GET    /api/tenants           → [{id, name, contact, status}]
POST   /api/tenants           body: {name, contact}
GET    /api/tenants/:id
PUT    /api/tenants/:id       body: {name, contact}
```

## 用户管理

```
GET    /api/users             ?tenant_id=&role=  → [{id, name, phone, role, dept_id}]
POST   /api/users             body: {phone, name, password, tenant_id, role, dept_id}
PUT    /api/users/:id
DELETE /api/users/:id
```

## 标准库

```
GET    /api/standards/categories        → 树形 [{id, parent_id, name, code, children: [...]}]
GET    /api/standards/indicators        ?category_id=  → [{id, code, name, category_id}]
GET    /api/standards/indicators/:id    → {id, ..., requirements: [{level, requirement_text}]}
POST   /api/standards/import            body: FormData (Excel file)
GET    /api/standards/export            → Excel 下载
```

## 评估项目

```
GET    /api/assessments                 ?status=  → [{id, name, target_level, status}]
POST   /api/assessments                 body: {name, target_level, category_ids}
GET    /api/assessments/:id             → {..., items: [{indicator_id, score, gap_note}]}
PUT    /api/assessments/:id             body: {name}
PUT    /api/assessments/:id/items/:iid  body: {score, gap_note}
POST   /api/assessments/:id/lock        → 生成快照，状态变为"审核中"
```

## 快照

```
GET    /api/snapshots                   ?assessment_id=  → [{id, version, total_score, locked_at}]
GET    /api/snapshots/:id               → {..., items: [...]}
GET    /api/snapshots/compare           ?snap1=id1&snap2=id2  → {diff: [...]}
```

## 报告

```
POST   /api/reports                     body: {assessment_id, snapshot_id, scope, dimensions, dept_ids}
GET    /api/reports/:id/preview         → HTML 预览
GET    /api/reports/:id/download        → PDF 下载
```

## 整改任务

```
GET    /api/tasks                       ?status=&dept_id=&assessment_id=
POST   /api/tasks                       body: {assessment_id, indicator_ids[], dept_id, priority, due_date}
PUT    /api/tasks/:id                   body: {title, priority, due_date, assignee_id}
POST   /api/tasks/:id/submit
POST   /api/tasks/:id/accept
POST   /api/tasks/:id/return            body: {reason}
POST   /api/tasks/:id/comments          body: {content}
```

## 看板

```
GET    /api/dashboard/overview          ?assessment_id=  → {total, completed, in_progress, ...}
GET    /api/dashboard/departments       ?assessment_id=  → [{dept_name, total, completed, rate}]
GET    /api/dashboard/dimensions        ?assessment_id=  → [{category_name, total, covered, rate}]
GET    /api/dashboard/trend             ?assessment_id=  → [{date, completed_count}]
```
