"""Seed database with PJ.md sample data for testing."""
from app.database import SessionLocal, engine, Base
from app.models import *
from app.utils.security import hash_password
from decimal import Decimal


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # ── Clean slate ──
    for t in [Notification, ReviewRecord, TaskComment, RectifyTask, SnapshotItem, Snapshot,
              AssessmentItem, Assessment, StdRequirement, StdIndicator, StdCategory,
              Department, UserTenant, User, Tenant]:
        try:
            db.query(t).delete()
        except Exception:
            pass
    db.commit()

    # ── Tenant (Hospital) ──
    t = Tenant(name="XX市人民医院", contact="010-12345678")
    db.add(t)
    db.flush()
    print(f"Tenant: {t.id} - {t.name}")

    # ── Departments ──
    dept_names = ["急诊科", "内科", "外科", "儿科", "妇产科", "药剂科"]
    depts = {}
    for name in dept_names:
        d = Department(tenant_id=t.id, name=name)
        db.add(d)
        db.flush()
        depts[name] = d
        print(f"  Dept: {d.id} - {name}")

    # ── Users ──
    # Director (院长)
    director = User(phone="director", password_hash=hash_password("123456"), name="张院长")
    db.add(director)
    db.flush()
    db.add(UserTenant(user_id=director.id, tenant_id=t.id, role="director"))
    print(f"Director: {director.id} - {director.name} (phone: director / 123456)")

    # Department heads
    dept_heads = {}
    for i, (name, dept) in enumerate(depts.items()):
        u = User(
            phone=f"dept{i+1}",
            password_hash=hash_password("123456"),
            name=f"{name[:1]}主任",
        )
        db.add(u)
        db.flush()
        db.add(UserTenant(user_id=u.id, tenant_id=t.id, role="dept_head", dept_id=dept.id))
        dept_heads[name] = u
        print(f"  DeptHead: {u.id} - {u.name} (phone: dept{i+1} / 123456)")

    # Admin user
    admin = User(phone="admin", password_hash=hash_password("admin123"), name="系统管理员", is_platform_admin=True)
    db.add(admin)
    db.flush()
    db.add(UserTenant(user_id=admin.id, tenant_id=t.id, role="admin"))
    print(f"Admin: {admin.id} - {admin.name} (phone: admin / admin123)")

    # ── Rating Categories (PJ.md sample data) ──
    cats = {}
    cat_data = [
        ("医疗质量与安全", "MED", 30.00, 1),
        ("护理管理", "NUR", 20.00, 2),
        ("院感防控", "INF", 15.00, 3),
        ("药事管理", "PHA", 15.00, 4),
        ("行政后勤", "ADM", 20.00, 5),
    ]
    for name, code, weight, sort in cat_data:
        c = StdCategory(name=name, code=code, weight=Decimal(str(weight)), sort_order=sort)
        db.add(c)
        db.flush()
        cats[name] = c
        print(f"  Category: {c.id} - {name} ({weight}%)")

    # ── Rating Indicators (PJ.md sample data) ──
    inds = {}
    indicator_data = [
        ("医疗质量与安全", "IND01", "住院患者死亡率", "≤0.8%", "%", "numeric_less_equal", 40.00),
        ("医疗质量与安全", "IND02", "手术并发症发生率", "≤2%", "%", "numeric_less_equal", 30.00),
        ("医疗质量与安全", "IND03", "I类切口感染率", "≤0.5%", "%", "numeric_less_equal", 30.00),
        ("护理管理", "IND04", "护理不良事件上报率", "≥95%", "%", "numeric_greater_equal", 50.00),
        ("护理管理", "IND05", "基础护理合格率", "≥90%", "%", "numeric_greater_equal", 50.00),
        ("院感防控", "IND06", "手卫生依从率", "≥80%", "%", "numeric_greater_equal", 100.00),
        ("药事管理", "IND07", "处方合格率", "≥90%", "%", "numeric_greater_equal", 100.00),
        ("行政后勤", "IND08", "消防演练完成率", "=100%", "%", "yesno", 100.00),
    ]
    for cat_name, code, name, sv, unit, itype, weight in indicator_data:
        ind = StdIndicator(
            category_id=cats[cat_name].id,
            code=code,
            name=name,
            standard_value=sv,
            unit=unit,
            indicator_type=itype,
            weight=Decimal(str(weight)),
            sort_order=0,
        )
        db.add(ind)
        db.flush()
        inds[name] = ind
        print(f"    Indicator: {ind.id} - {name} ({sv} / type:{itype})")

    # ── Sample assessment (急诊科, submitted) ──
    a1 = Assessment(
        tenant_id=t.id,
        name="急诊科 — 2025年度评级",
        target_level=5,
        department_id=depts["急诊科"].id,
        rating_cycle="2025年度",
        submitter_id=dept_heads["急诊科"].id,
        status="draft",
    )
    db.add(a1)
    db.flush()
    for ind in inds.values():
        db.add(AssessmentItem(assessment_id=a1.id, indicator_id=ind.id))
    print(f"Assessment: {a1.id} - {a1.name}")

    db.commit()
    db.close()
    print("\nSeed complete! Login credentials:")
    print("  院长:  director / 123456")
    print("  科室:  dept1 (急诊科) ~ dept6 (药剂科) / 123456")
    print("  管理员: admin / admin123")


if __name__ == "__main__":
    seed()
