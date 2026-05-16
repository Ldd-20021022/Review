# EMR 评级差距自评与整改系统 — AI 开发指引

## 项目关键文件路径

| 文件 | 路径 | 用途 |
|---|---|---|
| 需求规格 | `docs/requirements.md` | 功能需求定义 |
| 技术架构 | `docs/architecture.md` | 技术选型与架构说明 |
| API 设计 | `docs/api-design.md` | 接口路由与参数定义 |
| 数据库设计 | `docs/database-schema.md` | 表结构与关系 |
| 开发计划 | `docs/development-plan.md` | 阶段划分与任务清单 |
| 编码规范 | `docs/standards.md` | 前后端编码约定 |
| 开发日志 | `dev-logs/YYYY-MM-DD.md` | 每日完成与待办 |

## 技术栈

- **后端**: Python FastAPI + SQLAlchemy + Alembic + WeasyPrint + python-jose (JWT)
- **前端**: Vue3 (Composition API + `<script setup>`) + Element Plus + Pinia + Vue Router + Axios
- **数据库**: SQLite (开发) / PostgreSQL (生产)

## 工作约定

1. **阶段驱动**: 按 `docs/development-plan.md` 中的6个阶段顺序推进，不跳阶段
2. **每日日志**: 每天结束时在 `dev-logs/` 创建 `YYYY-MM-DD.md`，记录：已完成事项、进行中事项、待办事项、遇到的问题
3. **修改优先**: 优先使用 Edit 修改已有文件，非必要不新建文件
4. **后端规范**: 依赖注入获取 DB session 和当前用户/租户；Pydantic 做请求校验；所有租户级查询必须过滤 tenant_id
5. **前端规范**: 组件使用 `<script setup>` 语法；API 调用统一走 `src/api/` 封装层；状态管理用 Pinia
6. **安全底线**: 密码 hash 存储，JWT 过期策略，租户数据隔离不可跨租户查询

## 每日开发日志模板

```markdown
# 开发日志 — YYYY-MM-DD

## 已完成
- [ ] 

## 进行中
- [ ] 

## 待办
- [ ] 

## 遇到的问题
- 
```
