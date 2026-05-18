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

    # ── Rating Categories (三甲评审标准 2022版) ──
    cats = {}
    cat_data = [
        ("医疗服务能力", "SER", 15.00, 1),
        ("医疗质量与安全", "QUA", 20.00, 2),
        ("护理管理", "NUR", 12.00, 3),
        ("院感防控", "INF", 10.00, 4),
        ("药事管理", "PHA", 10.00, 5),
        ("患者安全", "SAF", 10.00, 6),
        ("医院管理", "MGT", 8.00, 7),
        ("信息管理", "INF", 5.00, 8),
        ("后勤保障", "LOG", 5.00, 9),
        ("行风建设", "ETH", 5.00, 10),
    ]
    for name, code, weight, sort in cat_data:
        c = StdCategory(name=name, code=code, weight=Decimal(str(weight)), sort_order=sort)
        db.add(c)
        db.flush()
        cats[name] = c
        print(f"  Category: {c.id} - {name} ({weight}%)")

    # ── Rating Indicators (60+ realistic items) ──
    inds = {}
    _i = 1
    def _add(cat, code, name, sv, unit, itype, weight):
        nonlocal _i
        ind = StdIndicator(category_id=cats[cat].id, code=f"HR{_i:03d}", name=name,
                           standard_value=sv, unit=unit, indicator_type=itype,
                           weight=Decimal(str(weight)), sort_order=0)
        db.add(ind); db.flush()
        inds[name] = ind; _i += 1

    # 医疗服务能力
    _add("医疗服务能力","","年门急诊人次","≥50万人次","人次","numeric_greater_equal",20)
    _add("医疗服务能力","","年出院人次数","≥2万人次","人次","numeric_greater_equal",15)
    _add("医疗服务能力","","年手术人次数","≥5000例","例","numeric_greater_equal",15)
    _add("医疗服务能力","","急危重症抢救成功率","≥85%","%","numeric_greater_equal",20)
    _add("医疗服务能力","","平均住院日","≤8天","天","numeric_less_equal",15)
    _add("医疗服务能力","","床位使用率","≥93%","%","numeric_greater_equal",15)

    # 医疗质量与安全
    _add("医疗质量与安全","","住院患者死亡率","≤0.8%","%","numeric_less_equal",10)
    _add("医疗质量与安全","","手术并发症发生率","≤2%","%","numeric_less_equal",8)
    _add("医疗质量与安全","","I类切口感染率","≤0.5%","%","numeric_less_equal",8)
    _add("医疗质量与安全","","非计划再手术率","≤0.5%","%","numeric_less_equal",8)
    _add("医疗质量与安全","","临床路径入径率","≥50%","%","numeric_greater_equal",5)
    _add("医疗质量与安全","","临床路径完成率","≥70%","%","numeric_greater_equal",5)
    _add("医疗质量与安全","","疑难病例讨论率","100%","%","numeric_equal",5)
    _add("医疗质量与安全","","死亡病例讨论率","100%","%","numeric_equal",5)
    _add("医疗质量与安全","","危急值报告及时率","≥95%","%","numeric_greater_equal",5)
    _add("医疗质量与安全","","会诊及时率","≥90%","%","numeric_greater_equal",5)
    _add("医疗质量与安全","","三级查房落实率","100%","%","numeric_equal",5)
    _add("医疗质量与安全","","手术安全核查执行率","100%","%","numeric_equal",5)

    # 护理管理
    _add("护理管理","","护理不良事件上报率","≥95%","%","numeric_greater_equal",15)
    _add("护理管理","","基础护理合格率","≥90%","%","numeric_greater_equal",15)
    _add("护理管理","","危重患者护理合格率","≥90%","%","numeric_greater_equal",15)
    _add("护理管理","","护理文书书写合格率","≥95%","%","numeric_greater_equal",10)
    _add("护理管理","","急救物品完好率","100%","%","numeric_equal",15)
    _add("护理管理","","护理人员培训覆盖率","100%","%","numeric_equal",10)
    _add("护理管理","","患者跌倒/坠床发生率","≤0.1%","%","numeric_less_equal",10)
    _add("护理管理","","压疮发生率","≤0.1%","%","numeric_less_equal",10)

    # 院感防控
    _add("院感防控","","手卫生依从率","≥80%","%","numeric_greater_equal",20)
    _add("院感防控","","医院感染发生率","≤10%","%","numeric_less_equal",20)
    _add("院感防控","","多重耐药菌检出率","≤30%","%","numeric_less_equal",15)
    _add("院感防控","","抗菌药物治疗前送检率","≥50%","%","numeric_greater_equal",15)
    _add("院感防控","","医疗废物规范处置率","100%","%","numeric_equal",15)
    _add("院感防控","","消毒灭菌合格率","100%","%","numeric_equal",15)

    # 药事管理
    _add("药事管理","","处方合格率","≥90%","%","numeric_greater_equal",20)
    _add("药事管理","","抗菌药物使用强度(DDD)","≤40","DDD","numeric_less_equal",15)
    _add("药事管理","","药品不良反应上报率","≥90%","%","numeric_greater_equal",15)
    _add("药事管理","","基本药物使用比例","≥60%","%","numeric_greater_equal",15)
    _add("药事管理","","特殊药品管理规范率","100%","%","numeric_equal",20)
    _add("药事管理","","静脉输液率","≤80%","%","numeric_less_equal",15)

    # 患者安全
    _add("患者安全","","医疗安全不良事件上报率","≥95%","%","numeric_greater_equal",20)
    _add("患者安全","","患者身份识别正确率","100%","%","numeric_equal",15)
    _add("患者安全","","术前核查正确执行率","100%","%","numeric_equal",15)
    _add("患者安全","","输血安全核查执行率","100%","%","numeric_equal",15)
    _add("患者安全","","患者满意度","≥90%","%","numeric_greater_equal",20)
    _add("患者安全","","医疗纠纷发生率","≤0.5%","%","numeric_less_equal",15)

    # 医院管理
    _add("医院管理","","依法执业合格率","100%","%","numeric_equal",20)
    _add("医院管理","","人员持证上岗率","100%","%","numeric_equal",15)
    _add("医院管理","","预算执行偏差率","≤5%","%","numeric_less_equal",15)
    _add("医院管理","","固定资产完好率","≥95%","%","numeric_greater_equal",15)
    _add("医院管理","","继续教育覆盖率","100%","%","numeric_equal",15)
    _add("医院管理","","科研课题立项数","≥10项/年","项","numeric_greater_equal",20)

    # 信息管理
    _add("信息管理","","电子病历系统功能应用水平","≥4级","级","numeric_greater_equal",25)
    _add("信息管理","","医院信息系统运行可靠率","≥99.9%","%","numeric_greater_equal",25)
    _add("信息管理","","医疗数据质量合格率","≥95%","%","numeric_greater_equal",25)
    _add("信息管理","","信息安全事件发生率","≤1次/年","次","numeric_less_equal",25)

    # 后勤保障
    _add("后勤保障","","消防演练完成率","100%","%","yesno",30)
    _add("后勤保障","","设备完好率","≥95%","%","numeric_greater_equal",20)
    _add("后勤保障","","水电气供应保障率","100%","%","numeric_equal",25)
    _add("后勤保障","","环境卫生监测合格率","≥95%","%","numeric_greater_equal",25)

    # 行风建设
    _add("行风建设","","医德医风考评覆盖率","100%","%","numeric_equal",25)
    _add("行风建设","","患者投诉处理及时率","≥95%","%","numeric_greater_equal",25)
    _add("行风建设","","红包收受举报率","0%","%","numeric_equal",25)
    _add("行风建设","","院务公开执行率","100%","%","numeric_equal",25)

    print(f"  Total indicators: {_i-1}")

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
