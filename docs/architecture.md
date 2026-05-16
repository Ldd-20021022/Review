# 技术架构

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 后端框架 | FastAPI | 异步、自动 OpenAPI 文档 |
| ORM | SQLAlchemy 2.0 | 声明式模型 |
| 迁移 | Alembic | 数据库版本管理 |
| 认证 | python-jose + passlib | JWT + bcrypt |
| PDF | WeasyPrint | HTML → PDF |
| Excel | openpyxl | 导入导出 |
| 前端框架 | Vue 3 + Vite | Composition API |
| UI 库 | Element Plus | 企业级组件库 |
| 状态管理 | Pinia | Vue3 官方推荐 |
| HTTP | Axios | 拦截器统一处理 |

## 多租户隔离策略

- 共享数据库 + tenant_id 列过滤
- 所有租户级表包含 tenant_id 外键
- API 层通过 JWT 提取 tenant_id，依赖注入到查询
- 超级管理员可以切换租户上下文

## 认证流程

```
Client                  Backend
  |--- POST /api/auth/login (phone + password) --->|
  |<--- { access_token, user_info } ---------------|
  |--- 后续请求 Header: Authorization: Bearer <token> --->|
  |                        extract user_id, tenant_id, role
  |                        Depends(get_current_user)
  |                        Depends(get_current_tenant)
```

## 目录结构

```
backend/
├── alembic/              # 数据库迁移
├── app/
│   ├── main.py           # FastAPI 入口 + CORS
│   ├── config.py         # Settings (DB URL, JWT secret, etc.)
│   ├── database.py       # engine, SessionLocal, Base
│   ├── models/           # SQLAlchemy models
│   ├── schemas/          # Pydantic request/response
│   ├── api/              # Route handlers
│   ├── services/         # Business logic (when complex)
│   ├── utils/            # security, pdf, excel
│   └── middleware/       # tenant middleware
└── tests/

frontend/
├── src/
│   ├── main.js           # App bootstrap
│   ├── App.vue           # Root component
│   ├── router/           # Vue Router config
│   ├── stores/           # Pinia stores (auth, tenant, etc.)
│   ├── views/            # Page-level components
│   ├── components/       # Reusable components
│   ├── api/              # Axios wrappers per module
│   └── utils/            # Helpers
├── index.html
├── package.json
└── vite.config.js
```
