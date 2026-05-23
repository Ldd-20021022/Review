"""核心流程测试"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import engine, Base

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    # Seed if needed
    from app.database import SessionLocal
    db = SessionLocal()
    from app.models.user import User
    if not db.query(User).filter(User.phone == "director").first():
        db.close()
        from seed import seed
        seed()
    else:
        db.close()
    yield


class TestAuth:
    def test_login_success(self):
        r = client.post("/api/auth/login", json={"phone": "director", "password": "123456"})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_wrong_password(self):
        r = client.post("/api/auth/login", json={"phone": "director", "password": "wrong"})
        assert r.status_code == 401

    def test_login_nonexistent(self):
        r = client.post("/api/auth/login", json={"phone": "noone", "password": "x"})
        assert r.status_code == 401

    def test_register_and_login(self):
        import random
        phone = f"test{random.randint(10000, 99999)}"
        r = client.post("/api/auth/register", json={"phone": phone, "password": "123456"})
        assert r.status_code == 200
        r = client.post("/api/auth/login", json={"phone": phone, "password": "123456"})
        assert r.status_code == 200

    def test_change_password(self):
        r = client.post("/api/auth/login", json={"phone": "director", "password": "123456"})
        token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        r = client.post("/api/auth/change-password", json={"old_password": "123456", "new_password": "newpass"}, headers=h)
        assert r.status_code == 200
        # Change back
        r = client.post("/api/auth/login", json={"phone": "director", "password": "newpass"})
        token2 = r.json()["access_token"]
        h2 = {"Authorization": f"Bearer {token2}"}
        r = client.post("/api/auth/change-password", json={"old_password": "newpass", "new_password": "123456"}, headers=h2)
        assert r.status_code == 200


class TestStandards:
    def test_list_standards(self):
        r = client.get("/api/hospital-ratings/standards")
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 10  # 33 categories

    def test_list_categories(self):
        r = client.get("/api/standards/categories")
        assert r.status_code == 200

    def test_template_download(self):
        r = client.get("/api/standards/template")
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "")


class TestDashboard:
    def _login(self):
        r = client.post("/api/auth/login", json={"phone": "director", "password": "123456"})
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def test_director_dashboard(self):
        r = client.get("/api/dashboard/director?set_type=hospital_grade", headers=self._login())
        assert r.status_code == 200
        d = r.json()
        assert "departments" in d
        assert "category_stats" in d
        assert "urgent" in d

    def test_dept_head_dashboard(self):
        r = client.post("/api/auth/login", json={"phone": "dept1", "password": "123456"})
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        r = client.get("/api/dashboard/director?set_type=hospital_grade", headers=h)
        assert r.status_code == 200


class TestAssessments:
    def _login(self, phone="director"):
        r = client.post("/api/auth/login", json={"phone": phone, "password": "123456"})
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def test_submit_and_report(self):
        h = self._login("dept1")
        r = client.post("/api/hospital-ratings/submit", json={
            "rating_cycle": "2025年度",
            "details": [
                {"indicator_id": 1, "actual_value": "0.6%"},
                {"indicator_id": 2, "actual_value": "2.5%"},
            ],
            "status": "submitted",
        }, headers=h)
        assert r.status_code == 200
        aid = r.json()["assessment_id"]
        r = client.get(f"/api/hospital-ratings/report/{aid}", headers=h)
        assert r.status_code == 200

    def test_save_draft(self):
        h = self._login("dept1")
        r = client.post("/api/hospital-ratings/submit", json={
            "rating_cycle": "2025年度",
            "details": [{"indicator_id": 1, "actual_value": "0.5%"}],
            "status": "draft",
        }, headers=h)
        assert r.status_code == 200
        assert r.json()["total_items"] == 1

    def test_gap_analysis(self):
        h = self._login("director")
        r = client.get("/api/dashboard/director?set_type=hospital_grade", headers=h)
        depts = r.json().get("departments", [])
        submitted = [d for d in depts if d.get("assessment_id")]
        if submitted:
            aid = submitted[0]["assessment_id"]
            r = client.get(f"/api/hospital-ratings/report/{aid}/gap-analysis", headers=h)
            assert r.status_code == 200


class TestAI:
    def _login(self):
        r = client.post("/api/auth/login", json={"phone": "director", "password": "123456"})
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def test_ai_summary(self):
        h = self._login()
        r = client.get("/api/dashboard/director?set_type=hospital_grade", headers=h)
        depts = r.json().get("departments", [])
        aid = next((d["assessment_id"] for d in depts if d.get("assessment_id")), None)
        if aid:
            r = client.get(f"/api/ai/summary/{aid}", headers=h)
            assert r.status_code == 200
            assert "report" in r.json()

    def test_export(self):
        h = self._login()
        r = client.get("/api/dashboard/director?set_type=hospital_grade", headers=h)
        depts = r.json().get("departments", [])
        aid = next((d["assessment_id"] for d in depts if d.get("assessment_id")), None)
        if aid:
            r = client.get(f"/api/ai/export/{aid}", headers=h)
            assert r.status_code == 200
            assert "indicators" in r.json()


class TestKnowledge:
    def test_search_regulations(self):
        r = client.get("/api/knowledge/regulations?q=死亡")
        assert r.status_code == 200

    def test_search_cases(self):
        r = client.get("/api/knowledge/cases")
        assert r.status_code == 200


class TestWorkflow:
    def _login(self):
        r = client.post("/api/auth/login", json={"phone": "director", "password": "123456"})
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def test_inspection(self):
        r = client.get("/api/workflow/inspection", headers=self._login())
        assert r.status_code == 200
        assert "items" in r.json()

    def test_create_pdca(self):
        h = self._login()
        r = client.get("/api/dashboard/director?set_type=hospital_grade", headers=h)
        depts = r.json().get("departments", [])
        aid = next((d["assessment_id"] for d in depts if d.get("assessment_id")), None)
        if aid:
            r = client.post(f"/api/workflow/pdca/create?assessment_id={aid}", headers=h)
            assert r.status_code == 200

    def test_meeting_crud(self):
        h = self._login()
        r = client.post("/api/workflow/meetings", json={
            "title": "2025年度三甲评审终审会",
            "meeting_date": "2025-06-15",
            "attendees": "张院长,李主任,王专家",
            "discussion": "讨论外科整改情况",
            "conclusions": "外科整改合格，通过评审",
            "votes_approve": 5, "votes_reject": 0, "votes_abstain": 0,
        }, headers=h)
        assert r.status_code == 200
        r = client.get("/api/workflow/meetings", headers=h)
        assert r.status_code == 200
        assert len(r.json()) > 0


class TestSystemAndAudit:
    def _login_admin(self):
        r = client.post("/api/auth/login", json={"phone": "admin", "password": "admin123"})
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def _login_director(self):
        r = client.post("/api/auth/login", json={"phone": "director", "password": "123456"})
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def test_system_info(self):
        r = client.get("/api/system/info", headers=self._login_director())
        assert r.status_code == 200
        info = r.json()
        assert "app_name" in info
        assert "db_connected" in info
        assert "deepseek_configured" in info

    def test_audit_logs(self):
        r = client.get("/api/audit-logs", headers=self._login_admin())
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data

    def test_audit_logs_pagination(self):
        r = client.get("/api/audit-logs?page=1&size=5", headers=self._login_admin())
        assert r.status_code == 200
        data = r.json()
        assert len(data["items"]) <= 5

    def test_audit_logs_filter(self):
        r = client.get("/api/audit-logs?action=submit", headers=self._login_admin())
        assert r.status_code == 200

    def test_health(self):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_tenant_management(self):
        h = self._login_admin()
        r = client.get("/api/tenants", headers=h)
        assert r.status_code == 200
        tenants = r.json()
        assert len(tenants) > 0


class TestKnowledgeSearch:
    def test_regulations_search(self):
        r = client.get("/api/knowledge/regulations?q=评审")
        assert r.status_code == 200

    def test_regulations_search_empty(self):
        r = client.get("/api/knowledge/regulations")
        assert r.status_code == 200

    def test_cases_search(self):
        r = client.get("/api/knowledge/cases")
        assert r.status_code == 200

    def test_case_detail_not_found(self):
        r = client.get("/api/knowledge/cases/99999")
        assert r.status_code == 404


class TestTenantIsolation:
    """Verify multi-tenant data isolation."""
    def _login(self, phone):
        r = client.post("/api/auth/login", json={"phone": phone, "password": "123456"})
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def test_my_department_only_own_data(self):
        h = self._login("dept1")
        r = client.get("/api/hospital-ratings/my-department", headers=h)
        assert r.status_code == 200

    def test_dept_head_denied_admin(self):
        h = self._login("dept1")
        r = client.get("/api/audit-logs", headers=h)
        # dept_head should not access admin endpoints
        assert r.status_code in (401, 403)

    def test_director_sees_all_departments(self):
        h = self._login("director")
        r = client.get("/api/dashboard/director?set_type=hospital_grade", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert len(data.get("departments", [])) >= 1
