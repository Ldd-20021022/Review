"""
达标判定核心算法 — 移植自 PJ.md 第4节 ComplianceService。

支持 5 种指标类型:
- numeric_less_equal:    实际值 ≤ 标准值 (越小越好)
- numeric_greater_equal: 实际值 ≥ 标准值 (越大越好)
- numeric_equal:         实际值 = 标准值
- numeric_range:         实际值在区间内 (标准值格式: "0.5%-1.5%")
- yesno:                 是/否判定
"""


# 标准值中可能出现的所有中文单位字符（不含数量级前缀）
_UNIT_CHARS = set("张个起元例人次名次床比例率‰天日月年小时厘米毫升升毫摩尔分秒点钟件种项科处所级类组等甲乙丙丁")

# 单位数量级前缀 — 需要作为乘法因子处理
_UNIT_MULTIPLIERS = {"万": 10_000, "亿": 100_000_000, "千": 1_000}


def _extract_number(value: str) -> float:
    """从带单位的字符串中提取数字值。

    支持格式: "≤1200张", "≥95%", "≤50万人次", "≥1:1.5", "100%", "0起"
    """
    v = str(value)
    multiplier = 1.0

    # 提取并应用数量级前缀（万/亿/千）
    for unit, mult in _UNIT_MULTIPLIERS.items():
        if unit in v:
            multiplier = mult
            v = v.replace(unit, "")
            break

    # 去掉比较运算符
    v = v.replace("≤", "").replace("≥", "").replace("<=", "").replace(">=", "")
    v = v.replace("=", "").replace(">", "").replace("<", "").replace(" ", "")

    # 处理比例格式 "1:1.5" → 计算第二项/第一项（每单位X对应的Y数量）
    # "医护比 >= 1:1.5" 含义：每1名医生至少1.5名护士 → 计算 1.5/1.0 = 1.5
    # "1:1.6" → 1.6/1.0 = 1.6 >= 1.5 → 达标
    if ":" in v:
        parts = v.split(":")
        first = "".join(c for c in parts[0] if c not in _UNIT_CHARS)
        second = "".join(c for c in parts[1] if c not in _UNIT_CHARS)
        try:
            v = str(float(second) / float(first))
        except (ValueError, ZeroDivisionError):
            v = parts[0]

    # 去掉百分号和千分号
    v = v.replace("%", "").replace("‰", "")

    # 去掉末尾（和中间）的中文单位字符
    v = "".join(c for c in v if c not in _UNIT_CHARS)

    # 去掉残余的分隔符（如 "1起/年" → "1/" → "1"）
    v = v.rstrip("/-.")

    # 去掉首尾空白
    v = v.strip()
    if not v:
        return 0.0

    # 移除残留的非数字字符（如纯中文 "是"）
    v = "".join(c for c in v if c.isdigit() or c in ".-")
    if not v or v in (".", "-", "-."):
        return 0.0

    return float(v) * multiplier


def check_compliance(actual_value: str, standard_value: str, indicator_type: str) -> dict:
    """
    判断单个指标是否达标。

    Returns:
        {"is_compliant": bool, "score": int}
    """
    # yesno: compare text directly, no numeric extraction needed
    if indicator_type == "yesno":
        ok = str(actual_value).lower() in ("是", "1", "yes", "true")
        return {"is_compliant": ok, "score": 100 if ok else 0}

    # numeric_range: standard is a range string like "0.5%-1.5%"
    if indicator_type == "numeric_range":
        try:
            parts = str(standard_value).replace("%", "").replace("‰", "").split("-")
            lo, hi = float(parts[0].strip()), float(parts[1].strip())
        except (ValueError, IndexError, AttributeError):
            return {"is_compliant": False, "score": 0}
        try:
            actual = _extract_number(actual_value)
        except (ValueError, TypeError):
            return {"is_compliant": False, "score": 0}

        if lo <= actual <= hi:
            return {"is_compliant": True, "score": 100}
        else:
            dist = min(abs(actual - lo), abs(actual - hi))
            return {"is_compliant": False, "score": max(0, int(100 - dist * 50))}

    # numeric types: extract numbers from both values
    try:
        actual = _extract_number(actual_value)
        standard = _extract_number(standard_value)
    except (ValueError, AttributeError, TypeError):
        return {"is_compliant": False, "score": 0}

    if indicator_type == "numeric_less_equal":
        if actual <= standard:
            return {"is_compliant": True, "score": 100}
        else:
            if standard > 0:
                deviation = (actual - standard) / standard
            else:
                deviation = abs(actual - standard)
            return {"is_compliant": False, "score": max(0, int(100 - deviation * 100))}

    elif indicator_type == "numeric_greater_equal":
        if actual >= standard:
            return {"is_compliant": True, "score": 100}
        else:
            if standard > 0:
                deviation = (standard - actual) / standard
            else:
                deviation = abs(standard - actual)
            return {"is_compliant": False, "score": max(0, int(100 - deviation * 100))}

    elif indicator_type == "numeric_equal":
        if actual == standard:
            return {"is_compliant": True, "score": 100}
        if standard > 0 and abs(actual - standard) / standard <= 0.02:
            return {"is_compliant": True, "score": 95}
        return {"is_compliant": False, "score": 0}

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
