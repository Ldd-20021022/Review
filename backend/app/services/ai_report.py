"""AI 智能报告生成 + 异常检测 + 卫健委格式导出"""

def generate_summary_report(assessment_data):
    """基于评估数据自动生成评审总结报告"""
    name = assessment_data.get("name", "")
    score = assessment_data.get("total_score", 0)
    items = assessment_data.get("items", [])
    total = len(items)
    compliant = [i for i in items if i.get("is_compliant")]
    non_compliant = [i for i in items if not i.get("is_compliant")]
    breakdown = assessment_data.get("categories_breakdown", [])

    # Categorize by urgency
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

    # Generate summary text
    lines = [
        f"# {name} 评审总结报告",
        f"",
        f"## 一、总体情况",
        f"- 评审总分: **{score}** 分  {'✅ 达标' if score >= 60 else '❌ 未达标'}",
        f"- 评审指标总数: {total} 项",
        f"- 达标项数: {len(compliant)} 项 ({round(len(compliant)/total*100,1)}%)",
        f"- 未达标项数: {len(non_compliant)} 项 ({round(len(non_compliant)/total*100,1)}%)",
        f"",
    ]

    # Category breakdown
    if breakdown:
        lines.append("## 二、各类别达标情况")
        for cat in breakdown:
            icon = "✅" if cat["rate"] >= 80 else "⚠️" if cat["rate"] >= 60 else "❌"
            lines.append(f"- {icon} {cat['name']}: {cat['compliant']}/{cat['total']} ({cat['rate']}%)")
        lines.append("")

    # Urgent issues
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

    # Recommendations
    lines.append("## 五、整改建议")
    lines.append("1. 针对急需整改项，建议在1-2个月内完成专项整改")
    lines.append("2. 对重点关注项，制定3-6个月的持续改进计划")
    lines.append("3. 建立指标监测机制，每月跟踪整改效果")
    lines.append("4. 加强相关科室人员培训和制度建设")
    lines.append("")
    lines.append(f"---")
    lines.append(f"*报告由三甲医院评级系统自动生成*")

    return {
        "markdown": "\n".join(lines),
        "score": score,
        "passed": score >= 60,
        "urgent_count": len(urgent_items),
        "high_count": len(high_priority),
        "urgent_items": urgent_items,
    }


def detect_anomalies(assessment_items):
    """异常检测 — 识别可疑填报数据"""
    alerts = []
    for item in assessment_items:
        val = item.get("actual_value", "")
        name = item.get("name", "")
        sv = item.get("standard_value", "")
        itype = item.get("indicator_type", "")

        if not val or val == "-":
            continue

        try:
            num = float(str(val).replace("%", "").replace(" ", ""))
        except (ValueError, TypeError):
            alerts.append({"indicator": name, "type": "无效数值", "detail": f"输入的 '{val}' 不是有效数字", "severity": "high"})
            continue

        if itype != "yesno":
            # Check for unrealistic values
            if "率" in name and num > 100:
                alerts.append({"indicator": name, "type": "数值超范围", "detail": f"比率类指标输入 {num}% 超过100%", "severity": "high"})
            if "死亡" in name and num > 50:
                alerts.append({"indicator": name, "type": "数值异常", "detail": f"死亡率指标输入 {num}% 偏高", "severity": "medium"})
            if num < 0:
                alerts.append({"indicator": name, "type": "负数值", "detail": f"指标值不能为负数", "severity": "high"})

        # Check for suspiciously perfect values
        if itype == "numeric_equal" and "100%" in sv and val == "100%":
            continue  # OK for mandatory items

        # Check if value is suspiciously close to threshold
        try:
            std = float(str(sv).replace("%", "").replace("≤", "").replace("≥", "").replace("=", "").replace(" ", ""))
            if std > 0 and abs(num - std) < 0.01 and "100" not in str(sv):
                alerts.append({"indicator": name, "type": "临界值", "detail": f"数值 {val} 恰好等于标准值 {sv}，请核实", "severity": "low"})
        except (ValueError, TypeError):
            pass

    return alerts


def export_health_commission_format(assessment_data):
    """导出卫健委标准格式 JSON"""
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
