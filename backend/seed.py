"""Seed database with 三级医院评审标准(2022年版) 完整数据.
WARNING: This script DELETES all existing data. Never run in production.
"""
import os
import sys
from datetime import datetime, timezone
from app.database import SessionLocal, engine, Base
from app.models import *
from app.utils.security import hash_password
from app.data.standards_2025 import STANDARDS_2025 as STANDARDS
from decimal import Decimal
from collections import OrderedDict


def seed():
    # Safety checks
    force = os.getenv("SEED_FORCE", "false").lower() == "true"
    is_docker = os.path.exists("/.dockerenv") or os.getenv("DOCKER_ENV", "") == "true"

    if not force and not is_docker and os.getenv("DEBUG", "false").lower() != "true":
        print("=" * 60)
        print("  WARNING: DEBUG is not set to 'true'.")
        print("  seed.py DELETES ALL DATA and recreates the database.")
        print("  Use SEED_FORCE=true to bypass, or set DEBUG=true.")
        print("=" * 60)
        sys.exit(1)

    # In Docker: only seed if DB is empty (check before wiping)
    if is_docker:
        db_check = SessionLocal()
        try:
            from app.models.user import User as _User
            existing = db_check.query(_User).first()
            db_check.close()
            if existing:
                print("Database already has data, skipping seed.")
                return
        except Exception:
            db_check.close()

    print("WARNING: This will DELETE ALL existing data and re-seed the database.")
    if not is_docker:
        print("Press Ctrl+C within 3 seconds to abort...")
        import time
        time.sleep(3)
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

    def _make_assessment(name, dept_key, submitter_key, status, values, cycle="2025年度"):
        """Helper: values = {code: actual_value}"""
        a = Assessment(
            tenant_id=t.id, name=f"{depts[dept_key].name} — {cycle}三甲评级",
            target_level=1, department_id=depts[dept_key].id, rating_cycle=cycle,
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
        "HR02": "1:1.6", "SV01": "48万人次",
    })
    print(f"Assessment: {a1.id} - {a1.name} (score:{a1.total_score})")

    # 外科 — rejected (deliberately bad data)
    a2 = _make_assessment("外科", "外科", "外科", "rejected", {
        "QL01": "1.2%", "QL09": "3.5%", "IF02": "0.8%", "NU08": "88%",
        "NU01": "89%", "IF07": "75%", "PH01": "95%", "LG02": "是",
        "HR02": "1:1.2", "SV01": "45万人次",
    })
    db.add(ReviewRecord(assessment_id=a2.id, reviewer_id=director.id, action="rejected",
        feedback="手术并发症和住院死亡率超标严重，请限期整改。加强围手术期管理和感染控制，一个月内重新提交。"))
    db.add(Notification(user_id=dept_heads["外科"].id, title="⚠️ 科室评级已退回",
        content=f"【外科 — 2025年度三甲评级】已被院长退回。\n总分: {a2.total_score} 分\n请尽快整改后重新提交！",
        type="reject", related_id=a2.id))
    # Create PDCA project for rejected assessment
    from app.models.workflow import PDCAProject
    for item in a2.items:
        if not item.is_compliant:
            ind = db.get(StdIndicator, item.indicator_id)
            if ind:
                db.add(PDCAProject(
                    assessment_id=a2.id, indicator_id=item.indicator_id,
                    dept_id=a2.department_id or 0,
                    title=f"整改: {ind.name}",
                    current_value=item.actual_value or "",
                    target_value=ind.standard_value or "",
                ))
    print(f"Assessment: {a2.id} - {a2.name} (score:{a2.total_score}, rejected)")

    # 内科 — approved (all good)
    a3 = _make_assessment("内科", "内科", "内科", "approved", {
        "QL01": "0.5%", "QL09": "1.2%", "IF02": "0.3%", "NU08": "97%",
        "NU01": "94%", "IF07": "88%", "PH01": "96%", "LG02": "是",
        "HR02": "1:1.8", "SV01": "55万人次",
    })
    db.add(ReviewRecord(assessment_id=a3.id, reviewer_id=director.id,
        action="approved", feedback="各项指标均达标，继续保持。"))
    print(f"Assessment: {a3.id} - {a3.name} (score:{a3.total_score}, approved)")

    # 儿科 — submitted (pending review)
    a4 = _make_assessment("儿科", "儿科", "儿科", "submitted", {
        "QL01": "0.4%", "QL09": "1.0%", "IF02": "0.2%", "NU08": "96%",
        "NU01": "95%", "IF07": "90%", "PH01": "97%", "LG02": "是",
        "HR02": "1:1.5", "SV01": "52万人次",
    })
    print(f"Assessment: {a4.id} - {a4.name} (score:{a4.total_score}, submitted)")

    # 妇产科 — draft
    a5 = _make_assessment("妇产科", "妇产科", "妇产科", "draft", {
        "QL01": "0.5%", "QL09": "1.8%", "IF02": "0.4%",
        "NU01": "90%", "IF07": "82%", "LG02": "是",
    })
    print(f"Assessment: {a5.id} - {a5.name} (score:{a5.total_score}, draft)")

    # 药剂科 — not submitted yet (no data)

    # ── Multi-cycle data for trend charts (same dept, different cycles) ──
    _make_assessment("急诊科", "急诊科", "急诊科", "approved", {
        "QL01": "0.5%", "QL09": "1.8%", "IF02": "0.3%", "NU08": "95%",
        "NU01": "94%", "IF07": "87%", "PH01": "95%", "LG02": "是",
        "HR02": "1:1.7", "SV01": "53万人次",
    }, cycle="2024年度")

    _make_assessment("急诊科", "急诊科", "急诊科", "approved", {
        "QL01": "0.7%", "QL09": "2.0%", "IF02": "0.4%", "NU08": "93%",
        "NU01": "92%", "IF07": "83%", "PH01": "92%", "LG02": "是",
        "HR02": "1:1.6", "SV01": "50万人次",
    }, cycle="2026-Q1")

    # ── Demo Knowledge Base: Regulations + Cases ──
    from app.models.knowledge import Regulation, RectifyCase
    db.add_all([
        Regulation(chapter="第一章", article="第三条",
            title="医院评审原则",
            content='医院评审坚持政府主导、分级负责、社会参与、公平公正的原则，贯彻"以评促建、以评促改、评建并举、重在内涵"的方针。',
            interpretation="评审不是目的而是手段，核心是通过评审推动医院持续改进医疗质量。",
            keywords="评审原则,以评促建,持续改进"),
        Regulation(chapter="第二章", article="第十二条",
            title="医疗质量管理",
            content="医疗机构应当建立医疗质量管理体系，实行院、科两级责任制。医疗机构主要负责人是本机构医疗质量管理的第一责任人。",
            interpretation="明确院科两级责任制，院长负总责，科主任负科室具体责任。",
            keywords="医疗质量,院科两级,责任制"),
        Regulation(chapter="第三章", article="第二十一条",
            title="患者安全目标",
            content="医疗机构应当落实患者安全目标，包括正确识别患者身份、改善有效沟通、确保手术安全、降低医疗相关感染风险等。",
            interpretation="患者安全目标是评审的重中之重，实行一票否决制。",
            keywords="患者安全,手术安全,感染控制"),
    ])
    db.add_all([
        RectifyCase(indicator_name="住院患者总死亡率", category="医疗质量",
            problem="住院总死亡率1.2%，超标0.4个百分点", root_cause="危重患者管理流程不完善，三级查房落实不到位",
            solution="1.建立危重患者早期预警评分制度 2.强化三级查房考核 3.每月进行死亡病例根因分析 4.建立快速反应团队",
            result="三个月后降至0.7%，达标", duration="3个月", difficulty="hard"),
        RectifyCase(indicator_name="手卫生依从率", category="院感管理",
            problem="手卫生依从率仅75%，远低于85%标准", root_cause="洗手设施不足，培训和监督不到位",
            solution="1.增加速干手消毒剂配置点 2.开展全员手卫生培训 3.实施暗访抽查和月度通报 4.将手卫生纳入绩效考核",
            result="两个月后提升至89%，达标", duration="2个月", difficulty="medium"),
        RectifyCase(indicator_name="处方合格率", category="药事管理",
            problem="门诊处方合格率仅92%，低于95%标准", root_cause="部分医生对处方规范不熟悉，前置审核系统覆盖不全",
            solution="1.上线处方前置审核系统 2.每月处方点评并反馈 3.组织处方书写规范培训 4.建立不合理处方公示制度",
            result="一个月后提升至96%，达标", duration="1个月", difficulty="easy"),
    ])

    # ── Demo Review Meeting ──
    from app.models.workflow import ReviewMeeting
    db.add(ReviewMeeting(
        tenant_id=t.id,
        title="2025年度三甲评审第一次工作会议",
        meeting_date=datetime(2025, 3, 15).date(),
        attendees="张院长、各科室主任、医务科、护理部",
        topics="1.通报2025年度三甲评审标准变化 2.各科室自评情况汇报 3.重点整改任务分工",
        discussion="张院长强调新标准中前置要求的重要性，要求各科室高度重视。急诊科汇报了急诊滞留时间改善措施。外科提出了手术并发症管理的难点。",
        conclusions="1.各科室于4月15日前完成自评 2.医务科统筹制定整改计划 3.下月召开第二次评审工作会",
        votes_approve=10, votes_reject=0, votes_abstain=1,
        recorder_id=director.id,
    ))

    db.commit()
    db.close()
    print("\nSeed complete! Login credentials:")
    print("  院长:  director / 123456")
    print("  科室:  dept1 (急诊科) ~ dept6 (药剂科) / 123456")
    print("  管理员: admin / admin123")


if __name__ == "__main__":
    seed()
