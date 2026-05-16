# EMR 评级差距自评与整改系统

帮助医院快速完成电子病历系统 4/5/6 级评级的差距自评、整改任务分配与进度跟踪。

## 技术栈

- 后端：Python FastAPI + SQLAlchemy + Alembic
- 前端：Vue 3 + Element Plus + Pinia
- 数据库：SQLite（开发）/ PostgreSQL（生产）

## 快速开始

```bash
# 后端
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# 前端
cd frontend
npm install
npm run dev
```

## 项目文档

- [需求规格](docs/requirements.md)
- [技术架构](docs/architecture.md)
- [API 设计](docs/api-design.md)
- [数据库设计](docs/database-schema.md)
- [开发计划](docs/development-plan.md)
- [编码规范](docs/standards.md)
