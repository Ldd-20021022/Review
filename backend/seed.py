"""Seed database with 三级医院评审标准(2022年版) 完整数据."""
from datetime import datetime, timezone
from app.database import SessionLocal, engine, Base
from app.models import *
from app.utils.security import hash_password
from app.data.standards_2025 import STANDARDS_2025 as STANDARDS
from decimal import Decimal
from collections import OrderedDict


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # ── Clean slate ──
    for t in [Notification, ReviewRecord, TaskComment, RectifyTask, SnapshotItem, Snapshot,
              AssessmentItem, Assessment, StdRequirement, StdIndicator, StdCategory,
              StandardSet, Department, UserTenant, User, Tenant]:
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

    # ── Standard Sets ──
    hg_set = StandardSet(name="三甲医院评审(2025年版)", type="hospital_grade")
    emr_set = StandardSet(name="电子病历评级", type="emr")
    db.add_all([hg_set, emr_set])
    db.flush()
    print(f"StandardSets: {hg_set.id} - {hg_set.name}, {emr_set.id} - {emr_set.name}")

    # ── Import 233 Standards from 2022 dataset ──
    cats = OrderedDict()
    # Group indicators by category
    cat_names = list(OrderedDict.fromkeys(s[0] for s in STANDARDS))
    for i, name in enumerate(cat_names):
        # Extract category code from first indicator's code (e.g., "SR01" → "SR")
        first_code = next(s[2] for s in STANDARDS if s[0] == name)
        code_prefix = ''.join(c for c in first_code if c.isalpha())[:3]
        c = StdCategory(name=name, code=code_prefix, weight=Decimal("0"), sort_order=i+1)
        db.add(c)
        db.flush()
        cats[name] = c
        print(f"  Category: {c.id} - {name}")

    inds = {}
    for cat_name, sub_cat, code, name, sv, unit, itype, weight in STANDARDS:
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
    print(f"  Total indicators: {len(inds)}")

    def _make_assessment(name, dept_key, submitter_key, status, values):
        """Helper: values = {code: actual_value}"""
        a = Assessment(
            tenant_id=t.id, name=f"{depts[dept_key].name} — 2025年度三甲评级(2025版)",
            target_level=1, department_id=depts[dept_key].id, rating_cycle="2025年度",
            submitter_id=dept_heads[submitter_key].id, status=status, set_id=hg_set.id,
        )
        db.add(a); db.flush()
        tw, total_w = 0, 0
        for code, actual_val in values.items():
            ind = db.query(StdIndicator).filter(StdIndicator.code == code).first()
            if not ind: continue
            item = AssessmentItem(assessment_id=a.id, indicator_id=ind.id, actual_value=actual_val)
            if ind.standard_value and ind.indicator_type:
                from app.services.compliance import check_compliance
                r = check_compliance(actual_val, ind.standard_value, ind.indicator_type)
                item.is_compliant = r["is_compliant"]; item.score = r["score"]
                if ind.weight: tw += (item.score or 0) * float(ind.weight) / 100; total_w += float(ind.weight)
            item.updated_at = datetime.now(timezone.utc); db.add(item)
        a.total_score = round(tw / total_w * 100, 2) if total_w else 0
        a.submitted_at = datetime.now(timezone.utc) if status != "draft" else None
        db.flush(); return a

    # 急诊科 — submitted
    a1 = _make_assessment("急诊科", "急诊科", "急诊科", "submitted", {
        "QL01": "0.6%", "QL09": "2.5%", "IF02": "0.3%", "NU08": "92%",
        "NU01": "93%", "IF07": "85%", "PH01": "91%", "LG02": "是",
    })
    print(f"Assessment: {a1.id} - {a1.name} (score:{a1.total_score})")

    # 外科 — rejected
    a2 = _make_assessment("外科", "外科", "外科", "rejected", {
        "QL01": "1.2%", "QL09": "3.5%", "IF02": "0.8%", "NU08": "88%",
        "NU01": "89%", "IF07": "75%", "PH01": "95%", "LG02": "是",
    })
    db.add(ReviewRecord(assessment_id=a2.id, reviewer_id=director.id, action="rejected",
        feedback="手术并发症和住院死亡率超标严重，请限期整改。加强围手术期管理和感染控制，一个月内重新提交。"))
    db.add(Notification(user_id=dept_heads["外科"].id, title="⚠️ 科室评级已退回",
        content=f"【外科 — 2025年度三甲评级】已被院长退回。\n总分: {a2.total_score} 分\n请尽快整改后重新提交！",
        type="reject", related_id=a2.id))
    print(f"Assessment: {a2.id} - {a2.name} (score:{a2.total_score}, rejected)")

    # 内科 — approved
    a3 = _make_assessment("内科", "内科", "内科", "approved", {
        "QL01": "0.5%", "QL09": "1.2%", "IF02": "0.3%", "NU08": "97%",
        "NU01": "94%", "IF07": "88%", "PH01": "96%", "LG02": "是",
    })
    db.add(ReviewRecord(assessment_id=a3.id, reviewer_id=director.id,
        action="approved", feedback="各项指标均达标，继续保持。"))
    print(f"Assessment: {a3.id} - {a3.name} (score:{a3.total_score}, approved)")

    db.commit()
    db.close()
    print("\nSeed complete! Login credentials:")
    print("  院长:  director / 123456")
    print("  科室:  dept1 (急诊科) ~ dept6 (药剂科) / 123456")
    print("  管理员: admin / admin123")


if __name__ == "__main__":
    seed()
