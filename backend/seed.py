"""Seed database with PJ.md sample data for testing."""
from datetime import datetime, timezone
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
    hg_set = StandardSet(name="三甲医院评审", type="hospital_grade")
    emr_set = StandardSet(name="电子病历评级", type="emr")
    db.add_all([hg_set, emr_set])
    db.flush()
    print(f"StandardSets: {hg_set.id} - {hg_set.name}, {emr_set.id} - {emr_set.name}")

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

    def _make_assessment(name, dept_key, submitter_key, status, values):
        """Helper to create an assessment with scored items."""
        a = Assessment(
            tenant_id=t.id,
            name=f"{depts[dept_key].name} — 2025年度三甲评级",
            target_level=1,
            department_id=depts[dept_key].id,
            rating_cycle="2025年度",
            submitter_id=dept_heads[submitter_key].id,
            status=status,
            set_id=hg_set.id,
        )
        db.add(a)
        db.flush()
        tw, total_w = 0, 0
        for ind_name, actual_val in values.items():
            ind = inds[ind_name]
            item = AssessmentItem(
                assessment_id=a.id, indicator_id=ind.id,
                actual_value=actual_val,
            )
            if ind.standard_value and ind.indicator_type:
                from app.services.compliance import check_compliance
                result = check_compliance(actual_val, ind.standard_value, ind.indicator_type)
                item.is_compliant = result["is_compliant"]
                item.score = result["score"]
                if ind.weight:
                    tw += (item.score or 0) * float(ind.weight) / 100
                    total_w += float(ind.weight)
            item.updated_at = datetime.now(timezone.utc)
            db.add(item)
        a.total_score = round(tw / total_w * 100, 2) if total_w else 0
        a.submitted_at = datetime.now(timezone.utc) if status != "draft" else None
        db.flush()
        return a

    # 急诊科 — submitted (mixed compliance)
    a1 = _make_assessment("急诊科", "急诊科", "急诊科", "submitted", {
        "住院患者死亡率": "0.6%",      # compliant (≤0.8%)
        "手术并发症发生率": "2.5%",    # non-compliant (>2%)
        "I类切口感染率": "0.3%",       # compliant (≤0.5%)
        "护理不良事件上报率": "92%",   # non-compliant (<95%)
        "基础护理合格率": "93%",       # compliant (≥90%)
        "手卫生依从率": "85%",         # compliant (≥80%)
        "处方合格率": "91%",           # compliant (≥90%)
        "消防演练完成率": "是",        # compliant
    })
    print(f"Assessment: {a1.id} - {a1.name} (score:{a1.total_score})")

    # 外科 — rejected
    a2 = _make_assessment("外科", "外科", "外科", "rejected", {
        "住院患者死亡率": "1.2%",      # non-compliant
        "手术并发症发生率": "3.5%",    # non-compliant
        "I类切口感染率": "0.8%",       # non-compliant
        "护理不良事件上报率": "88%",   # non-compliant
        "基础护理合格率": "89%",       # non-compliant
        "手卫生依从率": "75%",         # non-compliant
        "处方合格率": "95%",           # compliant
        "消防演练完成率": "是",        # compliant
    })
    db.add(ReviewRecord(
        assessment_id=a2.id, reviewer_id=director.id,
        action="rejected",
        feedback="手术并发症发生率和住院患者死亡率超标严重，请外科限期整改。重点加强围手术期管理和感染控制措施，一个月内重新提交。",
    ))
    db.add(Notification(
        user_id=dept_heads["外科"].id,
        title="⚠️ 您的科室评级未通过，已被退回",
        content=f"【外科 — 2025年度三甲评级】已被院长退回。\n\n总分: {a2.total_score} 分\n\n院长意见: 手术并发症发生率和住院患者死亡率超标严重，请外科限期整改。\n\n请尽快整改后重新提交！",
        type="reject",
        related_id=a2.id,
    ))
    print(f"Assessment: {a2.id} - {a2.name} (score:{a2.total_score}, rejected)")

    # 内科 — approved
    a3 = _make_assessment("内科", "内科", "内科", "approved", {
        "住院患者死亡率": "0.5%",
        "手术并发症发生率": "1.2%",
        "I类切口感染率": "0.3%",
        "护理不良事件上报率": "97%",
        "基础护理合格率": "94%",
        "手卫生依从率": "88%",
        "处方合格率": "96%",
        "消防演练完成率": "是",
    })
    db.add(ReviewRecord(
        assessment_id=a3.id, reviewer_id=director.id,
        action="approved", feedback="各项指标均达标，继续保持。",
    ))
    print(f"Assessment: {a3.id} - {a3.name} (score:{a3.total_score}, approved)")

    db.commit()
    db.close()
    print("\nSeed complete! Login credentials:")
    print("  院长:  director / 123456")
    print("  科室:  dept1 (急诊科) ~ dept6 (药剂科) / 123456")
    print("  管理员: admin / admin123")


if __name__ == "__main__":
    seed()
