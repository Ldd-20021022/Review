"""AI 差距分析服务 — 基于规则生成整改建议"""

SUGGESTIONS = {
    "住院患者总死亡率": {"priority": "urgent", "suggestion": "加强危重患者管理，落实三级查房和疑难病例讨论制度。优化诊疗方案，建立死亡病例根因分析机制。", "timeline": "1个月"},
    "手术患者死亡率": {"priority": "urgent", "suggestion": "强化术前风险评估和术中监测，提高麻醉安全管理水平。开展手术安全专项培训。", "timeline": "1个月"},
    "围手术期死亡率": {"priority": "urgent", "suggestion": "完善围手术期管理制度，建立高危手术多学科讨论机制。", "timeline": "2个月"},
    "手术并发症发生率": {"priority": "urgent", "suggestion": "开展手术质量改进项目，加强手术团队技能培训。实施并发症监测与预警机制。", "timeline": "2个月"},
    "I类切口手术感染率": {"priority": "high", "suggestion": "强化手术室无菌操作规范，加强围手术期抗菌药物管理。定期培训手术室人员。", "timeline": "1个月"},
    "非计划再手术率": {"priority": "high", "suggestion": "提高首次手术质量，完善术后随访和早期干预机制。建立再手术根因分析。", "timeline": "2个月"},
    "手卫生依从率": {"priority": "medium", "suggestion": "加强手卫生培训和宣传，完善洗手设施。实施手卫生监督考核制度。", "timeline": "1个月"},
    "临床路径入径率": {"priority": "medium", "suggestion": "扩大临床路径覆盖面，优化路径模板。加强医生培训和信息提示。", "timeline": "3个月"},
    "平均住院日": {"priority": "medium", "suggestion": "推进日间手术和快速康复，优化检查流程。加强出院计划管理。", "timeline": "3个月"},
    "CMI": {"priority": "high", "suggestion": "优化病种结构，提升疑难危重症收治比例。加强专科能力建设。", "timeline": "6个月"},
    "四级手术占比": {"priority": "high", "suggestion": "引进高级人才，加强关键技术培训。建立四级手术激励机制。", "timeline": "6个月"},
    "电子病历": {"priority": "high", "suggestion": "升级信息系统，完善临床决策支持功能。推进无纸化建设。", "timeline": "6个月"},
    "主要诊断编码正确率": {"priority": "medium", "suggestion": "加强编码员培训和质控，引入编码辅助系统。定期开展编码质量审核。", "timeline": "2个月"},
    "处方合格率": {"priority": "high", "suggestion": "实施处方前置审核，加强药师审方能力。定期开展处方点评和反馈。", "timeline": "1个月"},
    "抗菌药物使用强度": {"priority": "high", "suggestion": "加强抗菌药物分级管理，推动AMS策略实施。定期公示科室抗菌药物使用数据。", "timeline": "2个月"},
    "基本药物使用比例": {"priority": "medium", "suggestion": "优化药品目录，加强基本药物使用考核。开展合理用药培训。", "timeline": "3个月"},
    "患者满意度": {"priority": "medium", "suggestion": "改善服务流程，加强医患沟通培训。实施满意度调查结果闭环管理。", "timeline": "3个月"},
    "医疗安全不良事件上报率": {"priority": "high", "suggestion": "建立非惩罚性上报文化，简化上报流程。加强事件分析和改进反馈。", "timeline": "1个月"},
    "住院患者总死亡率": {"priority": "urgent", "suggestion": "强化危重患者早期识别和干预能力，完善急救体系和快速反应团队建设。", "timeline": "2个月"},
}

DEFAULT_SUGGESTION = {
    "priority": "medium",
    "suggestion": "对照评审标准分析差距原因，制定专项整改方案，明确责任人和完成时限。",
    "timeline": "3个月",
}


def analyze_gap(indicator_name, standard_value, actual_value, indicator_type):
    """分析单个指标的差距并生成整改建议"""
    # Calculate gap
    try:
        std = float(str(standard_value).replace("%", "").replace("≤", "").replace("≥", "")
                      .replace("=", "").replace(" ", "").replace("元", "").replace("张", "")
                      .replace("例", "").replace("人次", ""))
        act = float(str(actual_value).replace("%", "").replace(" ", ""))
    except (ValueError, TypeError):
        return None

    gap = abs(act - std) if indicator_type != "yesno" else (0 if actual_value in ("是", "1", "yes", "true") else 1)
    gap_pct = round(gap / std * 100, 1) if std > 0 else 0

    # Get suggestion
    advice = SUGGESTIONS.get(indicator_name, DEFAULT_SUGGESTION).copy()
    advice["gap"] = gap
    advice["gap_pct"] = gap_pct
    advice["current_value"] = actual_value
    advice["target_value"] = standard_value

    return advice


def analyze_assessment(report_items):
    """对整个评估进行差距分析，生成整改优先级排序"""
    gaps = []
    for item in report_items:
        if item.get("is_compliant"):
            continue
        analysis = analyze_gap(
            item.get("name", ""),
            item.get("standard_value", ""),
            item.get("actual_value", ""),
            item.get("indicator_type", ""),
        )
        if analysis:
            analysis["indicator_name"] = item.get("name")
            analysis["category_name"] = item.get("category_name")
            gaps.append(analysis)

    # Sort by urgency
    priority_order = {"urgent": 0, "high": 1, "medium": 2, "low": 3}
    gaps.sort(key=lambda g: (priority_order.get(g.get("priority", "medium"), 2), -g.get("gap_pct", 0)))

    # Summary
    total = len(report_items)
    non_compliant = len(gaps)
    urgent = sum(1 for g in gaps if g.get("priority") == "urgent")
    high = sum(1 for g in gaps if g.get("priority") == "high")

    return {
        "total_indicators": total,
        "non_compliant_count": non_compliant,
        "urgent_count": urgent,
        "high_count": high,
        "overall_assessment": "需要重点关注" if urgent > 0 else "需要持续改进" if non_compliant > 0 else "达标情况良好",
        "recommendations": gaps[:20],  # Top 20
    }
