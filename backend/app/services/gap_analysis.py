"""AI 差距分析服务 — DeepSeek 驱动 + 规则回退"""
import json
from .deepseek_client import chat_structured

GAP_SYSTEM = """\
你是三甲医院评审整改专家，精通医疗质量指标分析和整改方案设计。
你需要针对每个未达标指标，给出：优先级(urgent/high/medium/low)、具体的整改建议、建议的完成时间线。
建议要具体、可操作，结合中国医院评审标准要求和实际临床管理经验。"""

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
}

DEFAULT_SUGGESTION = {
    "priority": "medium",
    "suggestion": "对照评审标准分析差距原因，制定专项整改方案，明确责任人和完成时限。",
    "timeline": "3个月",
}


from .compliance import _extract_number


def _calc_gap(standard_value, actual_value, indicator_type):
    """Calculate gap between actual and standard value."""
    try:
        std = _extract_number(standard_value)
        act = _extract_number(actual_value)
    except (ValueError, TypeError):
        return None

    gap = abs(act - std) if indicator_type != "yesno" else (0 if actual_value in ("是", "1", "yes", "true") else 1)
    gap_pct = round(gap / std * 100, 1) if std > 0 else 0
    return {"gap": gap, "gap_pct": gap_pct, "std": std, "act": act}


def analyze_gap(indicator_name, standard_value, actual_value, indicator_type):
    """规则引擎分析单个指标差距（保留作为回退方案）"""
    calc = _calc_gap(standard_value, actual_value, indicator_type)
    if calc is None:
        return None

    advice = SUGGESTIONS.get(indicator_name, DEFAULT_SUGGESTION).copy()
    advice["gap"] = calc["gap"]
    advice["gap_pct"] = calc["gap_pct"]
    advice["current_value"] = actual_value
    advice["target_value"] = standard_value
    return advice


def analyze_gap_ai(indicator_name, standard_value, actual_value, indicator_type, category_name=""):
    """AI 驱动单指标差距分析，失败时回退规则引擎"""
    calc = _calc_gap(standard_value, actual_value, indicator_type)
    if calc is None:
        return None

    # Build gap items for AI
    gap_items = [{
        "indicator_name": indicator_name,
        "category": category_name,
        "standard_value": standard_value,
        "actual_value": actual_value,
        "indicator_type": indicator_type,
        "gap": calc["gap"],
        "gap_pct": calc["gap_pct"],
    }]

    result = _ai_analyze_gaps(gap_items)
    if result:
        r = result[0]
        r["gap"] = calc["gap"]
        r["gap_pct"] = calc["gap_pct"]
        r["current_value"] = actual_value
        r["target_value"] = standard_value
        return r

    # Fallback to rules
    return analyze_gap(indicator_name, standard_value, actual_value, indicator_type)


def analyze_assessment(report_items):
    """对整个评估进行差距分析（规则引擎，保留兼容）"""
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

    priority_order = {"urgent": 0, "high": 1, "medium": 2, "low": 3}
    gaps.sort(key=lambda g: (priority_order.get(g.get("priority", "medium"), 2), -g.get("gap_pct", 0)))

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
        "recommendations": gaps[:20],
        "source": "rule",
    }


def analyze_assessment_ai(report_items, assessment_name=""):
    """AI 驱动全评估差距分析，失败时回退规则引擎"""
    gaps_data = []
    for item in report_items:
        if item.get("is_compliant"):
            continue
        calc = _calc_gap(
            item.get("standard_value", ""),
            item.get("actual_value", ""),
            item.get("indicator_type", ""),
        )
        if calc is None:
            continue
        gaps_data.append({
            "indicator_name": item.get("name", ""),
            "category": item.get("category_name", ""),
            "standard_value": item.get("standard_value", ""),
            "actual_value": item.get("actual_value", ""),
            "indicator_type": item.get("indicator_type", ""),
            "gap": calc["gap"],
            "gap_pct": calc["gap_pct"],
        })

    if not gaps_data:
        return analyze_assessment(report_items)

    ai_results = _ai_analyze_gaps(gaps_data)

    if ai_results:
        # Merge AI results with original item data
        for r in ai_results:
            match = next((g for g in gaps_data if g["indicator_name"] == r.get("indicator_name")), None)
            if match:
                r["gap"] = match["gap"]
                r["gap_pct"] = match["gap_pct"]
                r["current_value"] = match["actual_value"]
                r["target_value"] = match["standard_value"]
                r["category_name"] = match["category"]

        priority_order = {"urgent": 0, "high": 1, "medium": 2, "low": 3}
        ai_results.sort(key=lambda g: (priority_order.get(g.get("priority", "medium"), 2), -g.get("gap_pct", 0)))

        total = len(report_items)
        non_compliant = len(ai_results)
        urgent = sum(1 for g in ai_results if g.get("priority") == "urgent")
        high = sum(1 for g in ai_results if g.get("priority") == "high")

        return {
            "total_indicators": total,
            "non_compliant_count": non_compliant,
            "urgent_count": urgent,
            "high_count": high,
            "overall_assessment": "需要重点关注" if urgent > 0 else "需要持续改进" if non_compliant > 0 else "达标情况良好",
            "recommendations": ai_results[:20],
            "source": "deepseek",
        }

    return analyze_assessment(report_items)


def _ai_analyze_gaps(gap_items):
    """Call DeepSeek to analyze gaps and return structured suggestions."""
    prompt = f"""请针对以下未达标的三甲医院评审指标，逐一给出整改建议：

{json.dumps(gap_items, ensure_ascii=False, indent=2)}

要求：
- priority: 根据与标准的偏差百分比和专业判断，设定 urgent(偏差≥30%)/high(偏差≥15%)/medium(偏差<15%)/low
- suggestion: 具体、可操作的整改建议（结合中国医院管理实践）
- timeline: 建议完成时间（如"1个月""3个月""6个月"）

返回JSON数组：
[
  {{
    "indicator_name": "指标名称",
    "priority": "urgent",
    "suggestion": "分步骤的具体整改方案",
    "timeline": "1个月"
  }}
]

只返回JSON数组，不要其他文字。"""

    return chat_structured(prompt, GAP_SYSTEM, temperature=0.3, max_tokens=16384)
