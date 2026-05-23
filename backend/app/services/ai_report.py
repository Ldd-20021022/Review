"""AI 智能报告生成 + 异常检测 + 卫健委格式导出 — 接入 DeepSeek V4 Pro"""
import json
from .deepseek_client import chat_with_system, chat_structured

# ── System prompts ──

SUMMARY_SYSTEM = """\
你是三甲医院等级评审专家，擅长分析医疗质量指标数据并撰写专业评审报告。
报告应包含：总体情况概述、各类别达标分析、重点问题识别、整改优先级建议。
使用专业但不晦涩的语言，数据准确，建议具体可操作。"""

ANOMALY_SYSTEM = """\
你是医疗数据质量审核专家，负责识别医院填报指标中的异常数据。
需要检测：数值超合理范围、数据自相矛盾、填报逻辑错误、明显笔误、临界值凑数等问题。
对每项异常给出：指标名称、异常类型、详细说明、严重程度(high/medium/low)。"""


# ── Rule-based fallback implementations ──

def _rule_summary(assessment_data):
    """Rule-based report generation (fallback when AI unavailable)."""
    name = assessment_data.get("name", "")
    score = assessment_data.get("total_score", 0)
    items = assessment_data.get("items", [])
    total = len(items)
    compliant = [i for i in items if i.get("is_compliant")]
    non_compliant = [i for i in items if not i.get("is_compliant")]
    breakdown = assessment_data.get("categories_breakdown", [])

    urgent_items = []
    high_priority = []
    for item in non_compliant:
        try:
            sv = float(str(item.get("standard_value", "0")).replace("%", "").replace("≤", "").replace("≥", ""))
            av = float(str(item.get("actual_value", "0")).replace("%", ""))
            gap_pct = abs((av - sv) / sv * 100) if sv > 0 else 100
        except (ValueError, TypeError):
            gap_pct = 50
        if gap_pct >= 30:
            urgent_items.append({**item, "gap_pct": round(gap_pct, 1)})
        elif gap_pct >= 15:
            high_priority.append({**item, "gap_pct": round(gap_pct, 1)})

    lines = [
        f"# {name} 评审总结报告",
        "",
        f"## 一、总体情况",
        f"- 评审总分: **{score}** 分  {'✅ 达标' if score >= 60 else '❌ 未达标'}",
        f"- 评审指标总数: {total} 项",
        f"- 达标项数: {len(compliant)} 项 ({round(len(compliant)/total*100,1)}%)",
        f"- 未达标项数: {len(non_compliant)} 项 ({round(len(non_compliant)/total*100,1)}%)",
        "",
    ]

    if breakdown:
        lines.append("## 二、各类别达标情况")
        for cat in breakdown:
            icon = "✅" if cat["rate"] >= 80 else "⚠️" if cat["rate"] >= 60 else "❌"
            lines.append(f"- {icon} {cat['name']}: {cat['compliant']}/{cat['total']} ({cat['rate']}%)")
        lines.append("")

    if urgent_items:
        lines.append("## 三、🔴 急需整改项（差距≥30%）")
        for i, item in enumerate(urgent_items[:10], 1):
            lines.append(f"{i}. **{item.get('name')}** — 当前: {item.get('actual_value')}, "
                        f"标准: {item.get('standard_value')}, 偏差: {item['gap_pct']}%")
        lines.append("")

    if high_priority:
        lines.append("## 四、🟠 重点关注项（差距≥15%）")
        for i, item in enumerate(high_priority[:10], 1):
            lines.append(f"{i}. **{item.get('name')}** — 当前: {item.get('actual_value')}, "
                        f"标准: {item.get('standard_value')}, 偏差: {item['gap_pct']}%")
        lines.append("")

    lines.append("## 五、整改建议")
    lines.append("1. 针对急需整改项，建议在1-2个月内完成专项整改")
    lines.append("2. 对重点关注项，制定3-6个月的持续改进计划")
    lines.append("3. 建立指标监测机制，每月跟踪整改效果")
    lines.append("4. 加强相关科室人员培训和制度建设")
    lines.append("")
    lines.append("---")
    lines.append("*报告由三甲医院评级系统自动生成*")

    return {
        "markdown": "\n".join(lines),
        "score": score,
        "passed": score >= 60,
        "urgent_count": len(urgent_items),
        "high_count": len(high_priority),
        "urgent_items": urgent_items,
    }


def _rule_anomalies(assessment_items):
    """Rule-based anomaly detection (fallback when AI unavailable)."""
    alerts = []
    for item in assessment_items:
        val = item.get("actual_value", "")
        name = item.get("name", "")
        sv = item.get("standard_value", "")

        if not val or val == "-":
            continue

        try:
            num = float(str(val).replace("%", "").replace(" ", ""))
        except (ValueError, TypeError):
            alerts.append({"indicator": name, "type": "无效数值", "detail": f"输入的 '{val}' 不是有效数字", "severity": "high"})
            continue

        itype = item.get("indicator_type", "")
        if itype != "yesno":
            if "率" in name and num > 100:
                alerts.append({"indicator": name, "type": "数值超范围", "detail": f"比率类指标输入 {num}% 超过100%", "severity": "high"})
            if "死亡" in name and num > 50:
                alerts.append({"indicator": name, "type": "数值异常", "detail": f"死亡率指标输入 {num}% 偏高", "severity": "medium"})
            if num < 0:
                alerts.append({"indicator": name, "type": "负数值", "detail": "指标值不能为负数", "severity": "high"})

        try:
            std = float(str(sv).replace("%", "").replace("≤", "").replace("≥", "").replace("=", "").replace(" ", ""))
            if std > 0 and abs(num - std) < 0.01 and "100" not in str(sv):
                alerts.append({"indicator": name, "type": "临界值", "detail": f"数值 {val} 恰好等于标准值 {sv}，请核实", "severity": "low"})
        except (ValueError, TypeError):
            pass

    return alerts


# ── AI-powered implementations ──

def generate_summary_report(assessment_data):
    """AI 生成评审总结报告，失败时回退到规则引擎"""
    prompt = _build_summary_prompt(assessment_data)
    ai_md = chat_with_system(prompt, SUMMARY_SYSTEM, temperature=0.3, max_tokens=16384)

    if ai_md:
        score = assessment_data.get("total_score", 0)
        items = assessment_data.get("items", [])
        non_compliant = [i for i in items if not i.get("is_compliant")]
        urgent = []
        high = []
        for item in non_compliant:
            try:
                sv = float(str(item.get("standard_value", "0")).replace("%", "").replace("≤", "").replace("≥", ""))
                av = float(str(item.get("actual_value", "0")).replace("%", ""))
                gap_pct = abs((av - sv) / sv * 100) if sv > 0 else 100
            except (ValueError, TypeError):
                gap_pct = 50
            if gap_pct >= 30:
                urgent.append({**item, "gap_pct": round(gap_pct, 1)})
            elif gap_pct >= 15:
                high.append({**item, "gap_pct": round(gap_pct, 1)})

        return {
            "markdown": ai_md,
            "score": score,
            "passed": score >= 60,
            "urgent_count": len(urgent),
            "high_count": len(high),
            "urgent_items": urgent,
            "source": "deepseek",
        }

    result = _rule_summary(assessment_data)
    result["source"] = "rule_fallback"
    return result


def detect_anomalies(assessment_items):
    """AI 异常检测，失败时回退到规则引擎"""
    prompt = _build_anomaly_prompt(assessment_items)
    ai_result = chat_structured(prompt, ANOMALY_SYSTEM, temperature=0.1, max_tokens=16384)

    if ai_result and isinstance(ai_result, list):
        return ai_result

    if ai_result and isinstance(ai_result, dict) and "alerts" in ai_result:
        return ai_result["alerts"]

    return _rule_anomalies(assessment_items)


def export_health_commission_format(assessment_data):
    """导出卫健委标准格式 JSON（格式固定，不需要 AI）"""
    items = assessment_data.get("items", [])
    records = []
    for item in items:
        records.append({
            "indicator_code": item.get("indicator_id", ""),
            "indicator_name": item.get("name", ""),
            "category": item.get("category_name", ""),
            "standard_value": item.get("standard_value", ""),
            "actual_value": item.get("actual_value", ""),
            "compliance": "达标" if item.get("is_compliant") else "未达标",
            "score": item.get("score", 0),
        })
    return {
        "hospital": assessment_data.get("name", ""),
        "cycle": assessment_data.get("rating_cycle", ""),
        "total_score": assessment_data.get("total_score", 0),
        "compliance_rate": assessment_data.get("compliance_rate", "0%"),
        "total_indicators": len(records),
        "compliant_count": sum(1 for r in records if r["compliance"] == "达标"),
        "indicators": records,
    }


# ── Prompt builders ──

def _build_summary_prompt(data):
    """Build structured prompt for AI report generation."""
    items = data.get("items", [])
    item_list = []
    for i in items:
        item_list.append(
            f"- [{i.get('category_name', '?')}] {i.get('name', '?')}: "
            f"标准={i.get('standard_value', '?')}, 实际={i.get('actual_value', '?')}, "
            f"达标={'是' if i.get('is_compliant') else '否'}, 得分={i.get('score', 0)}"
        )

    breakdown = data.get("categories_breakdown", [])
    cat_list = [f"- {c['name']}: {c['compliant']}/{c['total']} 达标 ({c['rate']}%)" for c in breakdown]

    return f"""请根据以下医院评审数据，生成一份专业的等级评审总结报告（Markdown格式）。

医院名称: {data.get('name', '?')}
评审周期: {data.get('rating_cycle', '?')}
评审总分: {data.get('total_score', 0)}
指标总数: {len(items)}

## 各类别达标情况
{chr(10).join(cat_list) if cat_list else '无分类数据'}

## 指标明细
{chr(10).join(item_list)}

请生成包含以下章节的Markdown报告：
1. 总体情况概述（达标率、总分、是否通过）
2. 各类别达标分析（按类别分析强弱项）
3. 重点问题识别（列出最关键的未达标项及差距）
4. 整改优先级建议（分urgent/high/medium三级）
5. 持续改进措施建议

要求：专业、数据准确、建议具体可操作。"""


def _build_anomaly_prompt(items):
    """Build structured prompt for AI anomaly detection."""
    item_list = []
    for i in items:
        item_list.append({
            "indicator": i.get("name", "?"),
            "category": i.get("category_name", "?"),
            "standard_value": i.get("standard_value", ""),
            "actual_value": i.get("actual_value", ""),
            "type": i.get("indicator_type", ""),
        })

    return f"""请检查以下医院指标填报数据，识别所有异常数据项。

指标数据:
{json.dumps(item_list, ensure_ascii=False, indent=2)}

检测规则：
- 比率类指标（名称含"率"）数值不应超过100%
- 死亡率不应异常偏高
- 数值不应为负数
- 填报值是否恰好等于标准值（临界值凑数嫌疑）
- 数值是否在合理范围内
- 同一科室相关指标是否存在逻辑矛盾

返回JSON数组，每项格式：
{{"indicator": "指标名称", "type": "异常类型", "detail": "详细说明", "severity": "high/medium/low"}}

如果没有异常，返回空数组 []。只返回JSON，不要其他文字。"""
