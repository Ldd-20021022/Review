from typing import List

from openpyxl import load_workbook
from sqlalchemy.orm import Session

from ..models.standard import StdCategory, StdIndicator, StdRequirement


def parse_standards_excel(file_path: str, db: Session) -> int:
    """Parse standards Excel and import into DB. Returns count of indicators added."""
    wb = load_workbook(file_path)
    ws = wb.active

    # Expected columns: L1_Category, L2_Category, Indicator_Code, Indicator_Name,
    #   Level4_Req, Level5_Req, Level6_Req
    rows = list(ws.iter_rows(min_row=2, values_only=True))

    category_cache = {}  # (l1_name, l2_name) -> category_id
    count = 0

    for row in rows:
        if not row or not row[0]:
            continue
        l1_name = str(row[0]).strip() if len(row) > 0 else ""
        l2_name = str(row[1]).strip() if len(row) > 1 else ""
        ind_code = str(row[2]).strip() if len(row) > 2 else ""
        ind_name = str(row[3]).strip() if len(row) > 3 else ""
        req_4 = str(row[4]).strip() if len(row) > 4 else ""
        req_5 = str(row[5]).strip() if len(row) > 5 else ""
        req_6 = str(row[6]).strip() if len(row) > 6 else ""

        if not ind_code or not ind_name:
            continue

        key = (l1_name, l2_name)
        if key not in category_cache:
            # Ensure L1 exists
            l1 = db.query(StdCategory).filter(
                StdCategory.name == l1_name, StdCategory.parent_id.is_(None)
            ).first()
            if not l1:
                l1 = StdCategory(name=l1_name, code=l1_name[:20], parent_id=None)
                db.add(l1)
                db.flush()

            # Ensure L2 exists
            l2 = db.query(StdCategory).filter(
                StdCategory.name == l2_name, StdCategory.parent_id == l1.id
            ).first()
            if not l2:
                l2 = StdCategory(name=l2_name, code=l2_name[:20], parent_id=l1.id)
                db.add(l2)
                db.flush()

            category_cache[key] = l2.id

        cat_id = category_cache[key]

        # Create indicator
        ind = StdIndicator(
            category_id=cat_id,
            code=ind_code,
            name=ind_name,
        )
        db.add(ind)
        db.flush()

        # Create requirements for each level
        if req_4:
            db.add(StdRequirement(indicator_id=ind.id, level=4, requirement_text=req_4))
        if req_5:
            db.add(StdRequirement(indicator_id=ind.id, level=5, requirement_text=req_5))
        if req_6:
            db.add(StdRequirement(indicator_id=ind.id, level=6, requirement_text=req_6))

        count += 1

    db.commit()
    return count
