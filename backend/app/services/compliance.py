"""
达标判定核心算法 — 移植自 PJ.md 第4节 ComplianceService。

支持 5 种指标类型:
- numeric_less_equal:    实际值 ≤ 标准值 (越小越好)
- numeric_greater_equal: 实际值 ≥ 标准值 (越大越好)
- numeric_equal:         实际值 = 标准值
- numeric_range:         实际值在区间内 (标准值格式: "0.5%-1.5%")
- yesno:                 是/否判定
"""


def _extract_number(value: str) -> float:
    """从带单位的字符串中提取数字值。"""
    return float(value.replace("%", "").replace(" ", "").replace("≤", "")
                .replace("≥", "").replace("=", "").replace(">", "").replace("<", ""))


def check_compliance(actual_value: str, standard_value: str, indicator_type: str) -> dict:
    """
    判断单个指标是否达标。

    Returns:
        {"is_compliant": bool, "score": int}
    """
    try:
        actual = _extract_number(actual_value)
        standard = _extract_number(standard_value)
    except (ValueError, AttributeError):
        return {"is_compliant": False, "score": 0}

    if indicator_type == "numeric_less_equal":
        # 实际值 ≤ 标准值（越小越好）
        if actual <= standard:
            return {"is_compliant": True, "score": 100}
        else:
            return {"is_compliant": False, "score": max(0, int(100 - (actual - standard) * 50))}

    elif indicator_type == "numeric_greater_equal":
        # 实际值 ≥ 标准值（越大越好）
        if actual >= standard:
            return {"is_compliant": True, "score": 100}
        else:
            return {"is_compliant": False, "score": max(0, int(100 - (standard - actual) * 50))}

    elif indicator_type == "numeric_equal":
        # 实际值 = 标准值
        ok = actual == standard
        return {"is_compliant": ok, "score": 100 if ok else 0}

    elif indicator_type == "numeric_range":
        # 标准值格式: "0.5%-1.5%"
        try:
            parts = standard_value.replace("%", "").split("-")
            lo, hi = float(parts[0]), float(parts[1])
        except (ValueError, IndexError):
            return {"is_compliant": False, "score": 0}

        if lo <= actual <= hi:
            return {"is_compliant": True, "score": 100}
        else:
            dist = min(abs(actual - lo), abs(actual - hi))
            return {"is_compliant": False, "score": max(0, int(100 - dist * 50))}

    elif indicator_type == "yesno":
        ok = actual_value.lower() in ("是", "1", "yes", "true")
        return {"is_compliant": ok, "score": 100 if ok else 0}

    else:
        return {"is_compliant": True, "score": 100}


def calculate_total_score(details: list) -> float:
    """计算加权总分。details 中每项需含 score 和 indicator.weight。"""
    total_weighted = 0.0
    total_weight = 0.0

    for d in details:
        score = d.get("score", 0) or 0
        weight = d.get("weight", 0) or 0
        total_weighted += score * weight / 100
        total_weight += weight

    return round(total_weighted / total_weight * 100, 2) if total_weight > 0 else 0.0


def generate_report(submission: dict) -> dict:
    """生成达标报告。submission 需含 items 列表。"""
    items = submission.get("items", [])
    compliant = [i for i in items if i.get("is_compliant")]
    non_compliant = [i for i in items if not i.get("is_compliant")]
    total = len(items)

    return {
        "total_score": submission.get("total_score", 0),
        "total_indicators": total,
        "compliant_count": len(compliant),
        "non_compliant_count": len(non_compliant),
        "compliance_rate": f"{(len(compliant) / total * 100):.1f}%" if total > 0 else "0%",
        "passed": float(submission.get("total_score", 0) or 0) >= 60,
        "compliant_items": [
            {
                "indicator_name": i.get("indicator_name"),
                "category_name": i.get("category_name"),
                "actual_value": i.get("actual_value"),
                "standard_value": i.get("standard_value"),
                "score": i.get("score"),
            }
            for i in compliant
        ],
        "non_compliant_items": [
            {
                "indicator_name": i.get("indicator_name"),
                "category_name": i.get("category_name"),
                "actual_value": i.get("actual_value"),
                "standard_value": i.get("standard_value"),
                "score": i.get("score"),
                "gap": f'当前 {i.get("actual_value")}，标准 {i.get("standard_value")}',
            }
            for i in non_compliant
        ],
    }
