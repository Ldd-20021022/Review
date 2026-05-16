# 数据库表结构

## 平台级表

### tenants
| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| name | VARCHAR(200) | 医院名称 |
| contact | VARCHAR(100) | 联系人 |
| status | VARCHAR(20) | active / disabled |
| created_at | DATETIME | |

### users
| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| phone | VARCHAR(20) UNIQUE | 登录手机号 |
| password_hash | VARCHAR(255) | bcrypt |
| name | VARCHAR(100) | |
| is_platform_admin | BOOLEAN | 是否超管 |
| created_at | DATETIME | |

### user_tenants
| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| user_id | FK → users | |
| tenant_id | FK → tenants | |
| role | VARCHAR(20) | admin / expert / dept_head / leader |
| dept_id | FK → departments (nullable) | 所属科室 |
| created_at | DATETIME | |

UNIQUE(user_id, tenant_id)

## 标准库表（平台级）

### std_categories
| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| parent_id | FK → std_categories (nullable) | null = 一级 |
| name | VARCHAR(200) | |
| code | VARCHAR(20) | 分类编码 |
| sort_order | INTEGER | |

### std_indicators
| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| category_id | FK → std_categories | 所属二级分类 |
| code | VARCHAR(20) | 指标编号 |
| name | VARCHAR(200) | |
| sort_order | INTEGER | |

### std_requirements
| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| indicator_id | FK → std_indicators | |
| level | INTEGER | 4 / 5 / 6 |
| requirement_text | TEXT | 该级别要求描述 |

UNIQUE(indicator_id, level)

## 租户级表

### departments
| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| tenant_id | FK → tenants | |
| name | VARCHAR(100) | |
| parent_id | FK → departments (nullable) | |

### assessments
| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| tenant_id | FK → tenants | |
| name | VARCHAR(200) | 项目名称 |
| target_level | INTEGER | 目标级别 4/5/6 |
| status | VARCHAR(20) | draft/assessing/review/rectifying/accepted/archived |
| created_at | DATETIME | |

### assessment_items
| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| assessment_id | FK → assessments | |
| indicator_id | FK → std_indicators | |
| score | INTEGER (0-100) | |
| gap_note | TEXT | 差距说明 |
| updated_at | DATETIME | |

UNIQUE(assessment_id, indicator_id)

### snapshots
| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| assessment_id | FK → assessments | |
| version | VARCHAR(10) | V1, V2, ... |
| total_score | FLOAT | 快照时综合得分 |
| locked_at | DATETIME | |

### snapshot_items
| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| snapshot_id | FK → snapshots | |
| indicator_id | FK → std_indicators | |
| score | INTEGER | |
| gap_note | TEXT | |

### rectify_tasks
| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| assessment_id | FK → assessments | |
| indicator_id | FK → std_indicators | |
| dept_id | FK → departments | |
| assignee_id | FK → users (nullable) | 具体负责人 |
| title | VARCHAR(300) | |
| gap_desc | TEXT | |
| target_level | INTEGER | |
| priority | VARCHAR(10) | low/medium/high/urgent |
| due_date | DATE | |
| status | VARCHAR(20) | pending/in_progress/submitted/accepted/returned |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### task_comments
| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| task_id | FK → rectify_tasks | |
| user_id | FK → users | |
| content | TEXT | |
| created_at | DATETIME | |

## 索引策略

- 所有 tenant_id 列建索引
- 所有外键列建索引
- assessments.status, rectify_tasks.status 建索引
- 联合索引: (tenant_id, status), (assessment_id, indicator_id)
