"""Compliance algorithm unit tests — the core business logic.
Covers: number extraction, compliance checking, scoring, total calculation.
All P0/P1 bugs fixed in 2026-05 audit are regression-tested here.
"""
import pytest
from app.services.compliance import _extract_number, check_compliance, calculate_total_score


# ═══════════════════════════════════════════════════════════
# Number Extraction
# ═══════════════════════════════════════════════════════════

class TestExtractNumber:
    def test_simple_percentage(self):
        assert _extract_number("95%") == 95.0
        assert _extract_number("0.8%") == 0.8
        assert _extract_number("100%") == 100.0

    def test_with_operator(self):
        assert _extract_number("≤0.8%") == 0.8
        assert _extract_number("≥95%") == 95.0
        assert _extract_number("<=3个") == 3.0
        assert _extract_number(">=70%") == 70.0

    def test_with_chinese_units(self):
        assert _extract_number("≤1200张") == 1200.0
        assert _extract_number("≥10张") == 10.0
        assert _extract_number("≤8天") == 8.0
        assert _extract_number("≥2.5万人次") == 25000.0  # P0 fix: 万 multiplier

    def test_wan_multiplier(self):
        """P0 fix: 万 should multiply by 10000, not be stripped as unit char."""
        assert _extract_number("≥50万人次") == 500000.0
        assert _extract_number("48万人次") == 480000.0
        assert _extract_number("2.5万人次") == 25000.0

    def test_yi_multiplier(self):
        assert _extract_number("1.5亿") == 150000000.0

    def test_qian_multiplier(self):
        assert _extract_number("3千人次") == 3000.0

    def test_ratio_extraction(self):
        """P0 fix: ratio 1:1.5 should extract as 1.5/1.0 = 1.5 (not 1/1.5)."""
        assert _extract_number("1:1.5") == pytest.approx(1.5)
        assert _extract_number("≥1:1.5") == pytest.approx(1.5)
        assert _extract_number("1:0.6") == pytest.approx(0.6)
        assert _extract_number("≥1:0.6") == pytest.approx(0.6)

    def test_ratio_various_values(self):
        """Ratio: second/first, so 1:1.6 > 1:1.5 (more nurses per doctor)."""
        assert _extract_number("1:1.6") == pytest.approx(1.6)
        assert _extract_number("1:1.2") == pytest.approx(1.2)
        assert _extract_number("1:0.4") == pytest.approx(0.4)

    def test_permille(self):
        assert _extract_number("≤15‰") == 15.0
        assert _extract_number("≤0.5‰") == 0.5

    def test_empty_fallback(self):
        """Non-numeric text should return 0, not crash."""
        assert _extract_number("abc") == 0.0

    def test_ratio_extraction_in_compliance(self):
        """HR02: >=1:1.5 with actual 1:1.6 should be compliant (1.6 > 1.5)."""
        r = check_compliance("1:1.6", "≥1:1.5", "numeric_greater_equal")
        assert r["is_compliant"] is True
        assert r["score"] == 100

    def test_ratio_extraction_non_compliant(self):
        """HR02: 1:1.2 < 1:1.5 should be non-compliant."""
        r = check_compliance("1:1.2", "≥1:1.5", "numeric_greater_equal")
        assert r["is_compliant"] is False


# ═══════════════════════════════════════════════════════════
# Compliance Checking — All 5 Types
# ═══════════════════════════════════════════════════════════

class TestCheckCompliance:

    # ── numeric_less_equal ──
    def test_less_equal_compliant(self):
        r = check_compliance("0.6%", "≤0.8%", "numeric_less_equal")
        assert r["is_compliant"] is True
        assert r["score"] == 100

    def test_less_equal_exact_boundary(self):
        r = check_compliance("0.8%", "≤0.8%", "numeric_less_equal")
        assert r["is_compliant"] is True

    def test_less_equal_non_compliant(self):
        r = check_compliance("1.2%", "≤0.8%", "numeric_less_equal")
        assert r["is_compliant"] is False
        # P1 fix: 50% relative deviation → score 50
        assert r["score"] == 50

    # ── numeric_greater_equal ──
    def test_greater_equal_compliant(self):
        r = check_compliance("97%", "≥95%", "numeric_greater_equal")
        assert r["is_compliant"] is True
        assert r["score"] == 100

    def test_greater_equal_exact_boundary(self):
        r = check_compliance("95%", "≥95%", "numeric_greater_equal")
        assert r["is_compliant"] is True

    def test_greater_equal_non_compliant(self):
        r = check_compliance("88%", "≥90%", "numeric_greater_equal")
        assert r["is_compliant"] is False
        # ~2.2% below → score ~97
        assert r["score"] == 97

    # ── numeric_equal ──
    def test_equal_exact(self):
        r = check_compliance("100%", "100%", "numeric_equal")
        assert r["is_compliant"] is True
        assert r["score"] == 100

    def test_equal_within_tolerance(self):
        """P1 fix: 2% tolerance for numeric_equal."""
        r = check_compliance("99%", "100%", "numeric_equal")
        assert r["is_compliant"] is True
        assert r["score"] == 95

    def test_equal_outside_tolerance(self):
        r = check_compliance("95%", "100%", "numeric_equal")
        assert r["is_compliant"] is False
        assert r["score"] == 0

    def test_equal_zero_standard(self):
        r = check_compliance("0起", "0起", "numeric_equal")
        assert r["is_compliant"] is True
        assert r["score"] == 100

    def test_equal_nonzero_vs_zero(self):
        r = check_compliance("1起", "0起", "numeric_equal")
        assert r["is_compliant"] is False
        assert r["score"] == 0

    # ── yesno ──
    def test_yesno_yes_cn(self):
        r = check_compliance("是", "有效", "yesno")
        assert r["is_compliant"] is True

    def test_yesno_no_cn(self):
        r = check_compliance("否", "有效", "yesno")
        assert r["is_compliant"] is False

    def test_yesno_english(self):
        assert check_compliance("yes", "", "yesno")["is_compliant"] is True

    def test_yesno_digit(self):
        assert check_compliance("1", "", "yesno")["is_compliant"] is True

    # ── numeric_range ──
    def test_range_compliant(self):
        r = check_compliance("0.8%", "0.5%-1.5%", "numeric_range")
        assert r["is_compliant"] is True

    def test_range_below(self):
        r = check_compliance("0.3%", "0.5%-1.5%", "numeric_range")
        assert r["is_compliant"] is False

    def test_range_above(self):
        r = check_compliance("2.0%", "0.5%-1.5%", "numeric_range")
        assert r["is_compliant"] is False


# ═══════════════════════════════════════════════════════════
# Score Calculation — Relative Deviation (P1 fix)
# ═══════════════════════════════════════════════════════════

class TestCalcScore:

    def test_relative_scoring_large_deviation(self):
        """P1 fix: AN01 400% deviation should score 0, not 98."""
        r = check_compliance("0.05%", "≤0.01%", "numeric_less_equal")
        assert r["score"] == 0

    def test_relative_scoring_small_deviation(self):
        """P1 fix: BD02 8.3% deviation should score ~91, not 0."""
        r = check_compliance("1300张", "≤1200张", "numeric_less_equal")
        assert r["score"] == 91

    def test_relative_scoring_medium_deviation(self):
        """50% over standard → score 50."""
        r = check_compliance("1.2%", "≤0.8%", "numeric_less_equal")
        assert r["score"] == 50

    def test_relative_scoring_wan(self):
        """SV01: 48万 vs 50万 → 4% below → score 96."""
        r = check_compliance("48万人次", "≥50万人次", "numeric_greater_equal")
        assert r["score"] == 96

    def test_score_distribution_less_equal(self):
        """Score should decrease linearly with relative deviation."""
        scores = []
        for actual in ["0.8%", "1.0%", "1.2%", "1.6%", "2.0%"]:
            r = check_compliance(actual, "≤0.8%", "numeric_less_equal")
            scores.append(r["score"])
        assert scores == [100, 75, 50, 0, 0]  # monotonic decrease

    def test_score_distribution_greater_equal(self):
        scores = []
        for actual in ["95%", "93%", "90%", "85%", "80%"]:
            r = check_compliance(actual, "≥95%", "numeric_greater_equal")
            scores.append(r["score"])
        assert scores == [100, 97, 94, 89, 84]


# ═══════════════════════════════════════════════════════════
# Total Score Calculation
# ═══════════════════════════════════════════════════════════

class TestTotalScore:

    def test_all_compliant(self):
        items = [{"score": 100, "weight": 5}, {"score": 100, "weight": 5}]
        assert calculate_total_score(items) == 100.0

    def test_all_failed(self):
        items = [{"score": 0, "weight": 5}, {"score": 0, "weight": 5}]
        assert calculate_total_score(items) == 0.0

    def test_mixed(self):
        items = [
            {"score": 100, "weight": 5},
            {"score": 0, "weight": 5},
            {"score": 100, "weight": 5},
        ]
        # (100*5 + 0*5 + 100*5) / 15 * 100
        # = (500 + 0 + 500) / 15 * 100 = 1000/15 * 100 = 66.67
        assert calculate_total_score(items) == pytest.approx(66.67, abs=0.01)

    def test_weighted_vs_unweighted(self):
        high_weight = [{"score": 50, "weight": 10}]
        low_weight = [{"score": 50, "weight": 1}]
        assert calculate_total_score(high_weight) == 50.0
        assert calculate_total_score(low_weight) == 50.0

    def test_high_weight_has_more_impact(self):
        items = [
            {"score": 100, "weight": 10},
            {"score": 0, "weight": 1},
        ]
        # (100*10 + 0*1) / 11 * 100 = 1000/11 * 100 = 90.91
        assert calculate_total_score(items) == pytest.approx(90.91, abs=0.01)

    def test_zero_weight_excluded(self):
        """Weight=0 items (前置要求 veto items) should be excluded from total."""
        items = [{"score": 100, "weight": 0}]
        assert calculate_total_score(items) == 0.0

    def test_mixed_with_zero_weight(self):
        items = [
            {"score": 0, "weight": 0},     # veto item, excluded
            {"score": 100, "weight": 5},   # included
        ]
        assert calculate_total_score(items) == 100.0


# ═══════════════════════════════════════════════════════════
# Integration: Real indicators from standards_2025
# ═══════════════════════════════════════════════════════════

class TestRealIndicators:
    """Test real indicator data from the 2025 standards."""

    def test_ql01_mortality(self):
        """住院患者总死亡率 ≤0.8%"""
        assert check_compliance("0.7%", "≤0.8%", "numeric_less_equal")["is_compliant"] is True
        assert check_compliance("1.2%", "≤0.8%", "numeric_less_equal")["is_compliant"] is False

    def test_hr02_nurse_ratio(self):
        """医护比 ≥1:1.5 — P0 fix regression test."""
        assert check_compliance("1:1.6", "≥1:1.5", "numeric_greater_equal")["is_compliant"] is True
        assert check_compliance("1:1.2", "≥1:1.5", "numeric_greater_equal")["is_compliant"] is False

    def test_sv01_emergency_visits(self):
        """年门急诊人次 ≥50万人次 — P0 fix regression."""
        r = check_compliance("48万人次", "≥50万人次", "numeric_greater_equal")
        assert r["is_compliant"] is False
        assert r["score"] == 96  # 4% below

    def test_an01_anesthesia_mortality(self):
        """麻醉死亡率 ≤0.01% — P1 fix regression."""
        r = check_compliance("0.05%", "≤0.01%", "numeric_less_equal")
        assert r["score"] == 0  # 400% deviation, was 98 before fix

    def test_bd02_bed_count(self):
        """单体院区床位数 ≤1200张 — P1 fix regression."""
        r = check_compliance("1300张", "≤1200张", "numeric_less_equal")
        assert r["score"] == 91  # 8.3% deviation, was ~0 before fix

    def test_ql14_round_rate(self):
        """三级查房落实率 =100% — tolerance test."""
        assert check_compliance("99%", "100%", "numeric_equal")["is_compliant"] is True
        assert check_compliance("97%", "100%", "numeric_equal")["is_compliant"] is False

    def test_pr06_no_rental(self):
        """Y/N indicator — yesno."""
        assert check_compliance("是", "是", "yesno")["is_compliant"] is True
        assert check_compliance("否", "是", "yesno")["is_compliant"] is False

    def test_full_assessment_simulation(self):
        """Simulate a real department assessment with 10 indicators."""
        items = [
            {"score": 100, "weight": 5},   # BD03 重症床位 ≥2%
            {"score": 100, "weight": 5},   # HR01 卫技占比 ≥70%
            {"score": 100, "weight": 5},   # HR02 医护比 ≥1:1.5 → 1:1.6 ✓
            {"score": 96, "weight": 5},    # SV01 门急诊 48万 vs 50万
            {"score": 100, "weight": 5},   # SV07 CMI ≥1.0
            {"score": 93, "weight": 5},    # EF01 住院日 8.5 vs ≤8天
            {"score": 100, "weight": 5},   # QL01 死亡率 0.7%
            {"score": 97, "weight": 4},    # QL11 编码 88% vs 90%
            {"score": 100, "weight": 5},   # IF01 感染率 6% vs 8%
            {"score": 97, "weight": 5},    # PH01 处方 93% vs 95%
        ]
        total = calculate_total_score(items)
        # Expected: (500+500+500+480+500+465+500+388+500+485) / 49 * 100
        # = 4818/49 = 98.33
        assert total == pytest.approx(98.33, abs=0.1)
