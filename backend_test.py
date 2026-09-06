#!/usr/bin/env python3
"""
Comprehensive backend test for Across Pipeline Dashboard
Tests all API endpoints with authentication, CRUD operations, and RBAC
"""

import requests
import json
import io
import time
from typing import Dict, Any, Optional

# Base URL from .env
BASE_URL = "https://across-monitor.preview.emergentagent.com/api"

# Test users
USERS = {
    "admin": {"email": "admin@across.id", "password": "across123"},
    "management": {"email": "management@across.id", "password": "across123"},
    "sales": {"email": "sales@across.id", "password": "across123"},
    "ops": {"email": "ops@across.id", "password": "across123"},
    "finance": {"email": "finance@across.id", "password": "across123"},
}

# Global state for cleanup
created_resources = {
    "approaches": [],
    "quotations": [],
    "pos": [],
    "schedules": [],
    "invoices-in": [],
    "invoices-out": [],
    "projects": [],
    "documents": [],
}

class TestSession:
    def __init__(self, name: str):
        self.name = name
        self.token = None
        self.cookie = None
        self.user = None
        
    def login(self, email: str, password: str) -> bool:
        """Login and store token/cookie"""
        try:
            resp = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password}, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                self.token = data.get("token")
                self.user = data.get("user")
                # Extract cookie from Set-Cookie header
                if "Set-Cookie" in resp.headers:
                    cookie_header = resp.headers["Set-Cookie"]
                    if "across_session=" in cookie_header:
                        self.cookie = cookie_header.split(";")[0]
                print(f"✅ {self.name} login successful: {self.user.get('name')} ({self.user.get('role')})")
                return True
            else:
                print(f"❌ {self.name} login failed: {resp.status_code} - {resp.text}")
                return False
        except Exception as e:
            print(f"❌ {self.name} login error: {e}")
            return False
    
    def headers(self, use_bearer: bool = True) -> Dict[str, str]:
        """Get headers with auth"""
        if use_bearer and self.token:
            return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        return {"Content-Type": "application/json"}
    
    def get(self, path: str, use_bearer: bool = True, **kwargs) -> requests.Response:
        """GET request with auth"""
        headers = self.headers(use_bearer)
        cookies = {} if use_bearer else {"across_session": self.cookie.split("=")[1]} if self.cookie else {}
        return requests.get(f"{BASE_URL}{path}", headers=headers, cookies=cookies, timeout=10, **kwargs)
    
    def post(self, path: str, use_bearer: bool = True, **kwargs) -> requests.Response:
        """POST request with auth"""
        headers = self.headers(use_bearer)
        cookies = {} if use_bearer else {"across_session": self.cookie.split("=")[1]} if self.cookie else {}
        return requests.post(f"{BASE_URL}{path}", headers=headers, cookies=cookies, timeout=10, **kwargs)
    
    def put(self, path: str, use_bearer: bool = True, **kwargs) -> requests.Response:
        """PUT request with auth"""
        headers = self.headers(use_bearer)
        cookies = {} if use_bearer else {"across_session": self.cookie.split("=")[1]} if self.cookie else {}
        return requests.put(f"{BASE_URL}{path}", headers=headers, cookies=cookies, timeout=10, **kwargs)
    
    def delete(self, path: str, use_bearer: bool = True, **kwargs) -> requests.Response:
        """DELETE request with auth"""
        headers = self.headers(use_bearer)
        cookies = {} if use_bearer else {"across_session": self.cookie.split("=")[1]} if self.cookie else {}
        return requests.delete(f"{BASE_URL}{path}", headers=headers, cookies=cookies, timeout=10, **kwargs)


def test_auth():
    """Test 1: Authentication endpoints"""
    print("\n" + "="*80)
    print("TEST 1: AUTHENTICATION")
    print("="*80)
    
    # Test login success
    print("\n[1.1] Testing login success...")
    resp = requests.post(f"{BASE_URL}/auth/login", json=USERS["admin"], timeout=10)
    assert resp.status_code == 200, f"Login failed: {resp.status_code} - {resp.text}"
    data = resp.json()
    assert "user" in data and "token" in data, "Missing user or token in response"
    assert "across_session" in resp.headers.get("Set-Cookie", ""), "Cookie not set"
    token = data["token"]
    print(f"✅ Login successful, token: {token[:20]}..., user: {data['user']['name']}")
    
    # Test wrong password
    print("\n[1.2] Testing wrong password...")
    resp = requests.post(f"{BASE_URL}/auth/login", json={"email": "admin@across.id", "password": "wrongpass"}, timeout=10)
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
    print(f"✅ Wrong password correctly returns 401")
    
    # Test GET /auth/me with token
    print("\n[1.3] Testing GET /auth/me with Bearer token...")
    resp = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert resp.status_code == 200, f"GET /auth/me failed: {resp.status_code}"
    data = resp.json()
    assert "user" in data, "Missing user in /auth/me response"
    print(f"✅ GET /auth/me successful: {data['user']['name']}")
    
    # Test unauthenticated request
    print("\n[1.4] Testing unauthenticated GET /dashboard...")
    resp = requests.get(f"{BASE_URL}/dashboard", timeout=10)
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
    print(f"✅ Unauthenticated request correctly returns 401")
    
    # Test GET /auth/demo-users (public)
    print("\n[1.5] Testing GET /auth/demo-users (public)...")
    resp = requests.get(f"{BASE_URL}/auth/demo-users", timeout=10)
    assert resp.status_code == 200, f"GET /auth/demo-users failed: {resp.status_code}"
    users = resp.json()
    assert isinstance(users, list) and len(users) >= 5, "Expected at least 5 demo users"
    print(f"✅ GET /auth/demo-users successful: {len(users)} users")
    
    # Test POST /auth/logout
    print("\n[1.6] Testing POST /auth/logout...")
    resp = requests.post(f"{BASE_URL}/auth/logout", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert resp.status_code == 200, f"Logout failed: {resp.status_code}"
    assert "across_session=" in resp.headers.get("Set-Cookie", ""), "Cookie not cleared"
    print(f"✅ Logout successful")
    
    print("\n✅ ALL AUTH TESTS PASSED")


def test_dashboard(session: TestSession):
    """Test 2: Dashboard endpoint"""
    print("\n" + "="*80)
    print("TEST 2: DASHBOARD")
    print("="*80)
    
    # Test dashboard with All business line and all period
    print("\n[2.1] Testing GET /dashboard?businessLine=All&period=all...")
    resp = session.get("/dashboard?businessLine=All&period=all")
    assert resp.status_code == 200, f"Dashboard failed: {resp.status_code} - {resp.text}"
    data = resp.json()
    
    # Check KPIs
    assert "kpis" in data, "Missing kpis"
    kpis = data["kpis"]
    required_kpi_fields = ["omzet", "margin", "marginPct", "piutang", "utang", "stok"]
    for field in required_kpi_fields:
        assert field in kpis, f"Missing KPI field: {field}"
    print(f"✅ KPIs present: omzet={kpis['omzet']}, margin={kpis['margin']}, marginPct={kpis['marginPct']}%, piutang={kpis['piutang']}, utang={kpis['utang']}, stok={kpis['stok']}")
    
    # Check pipeline
    assert "pipeline" in data, "Missing pipeline"
    pipeline = data["pipeline"]
    assert len(pipeline) == 7, f"Expected 7 pipeline stages, got {len(pipeline)}"
    stage_names = [s["key"] for s in pipeline]
    expected_stages = ["approach", "penawaran", "po", "schedule", "bast", "invoice-in", "invoice-out"]
    assert stage_names == expected_stages, f"Pipeline stages mismatch: {stage_names}"
    
    # Check counts
    counts = {s["key"]: s["count"] for s in pipeline}
    print(f"✅ Pipeline counts: approach={counts['approach']}, penawaran={counts['penawaran']}, po={counts['po']}, schedule={counts['schedule']}, bast={counts['bast']}, invoice-in={counts['invoice-in']}, invoice-out={counts['invoice-out']}")
    
    # Verify expected counts from seed data
    assert counts["approach"] == 20, f"Expected 20 approaches, got {counts['approach']}"
    assert counts["penawaran"] == 12, f"Expected 12 quotations, got {counts['penawaran']}"
    assert counts["po"] == 8, f"Expected 8 POs, got {counts['po']}"
    assert counts["schedule"] == 10, f"Expected 10 schedules, got {counts['schedule']}"
    assert counts["bast"] == 6, f"Expected 6 BASTs, got {counts['bast']}"
    assert counts["invoice-in"] == 5, f"Expected 5 invoice-in, got {counts['invoice-in']}"
    assert counts["invoice-out"] == 5, f"Expected 5 invoice-out, got {counts['invoice-out']}"
    
    # Check recent projects
    assert "recentProjects" in data, "Missing recentProjects"
    assert isinstance(data["recentProjects"], list), "recentProjects should be a list"
    print(f"✅ Recent projects: {len(data['recentProjects'])} items")
    
    # Check alerts
    assert "alerts" in data, "Missing alerts"
    assert isinstance(data["alerts"], list), "alerts should be a list"
    assert len(data["alerts"]) > 0, "Expected non-empty alerts array"
    for alert in data["alerts"]:
        assert "href" in alert, "Alert missing href"
    print(f"✅ Alerts: {len(data['alerts'])} alerts with hrefs")
    
    # Test with Trading filter
    print("\n[2.2] Testing GET /dashboard?businessLine=Trading&period=this_month...")
    resp = session.get("/dashboard?businessLine=Trading&period=this_month")
    assert resp.status_code == 200, f"Dashboard with filters failed: {resp.status_code}"
    data = resp.json()
    assert "kpis" in data and "pipeline" in data, "Missing required fields"
    print(f"✅ Dashboard with businessLine=Trading and period=this_month successful")
    
    print("\n✅ ALL DASHBOARD TESTS PASSED")


def test_summary(session: TestSession):
    """Test 3: Summary endpoint"""
    print("\n" + "="*80)
    print("TEST 3: SUMMARY")
    print("="*80)
    
    print("\n[3.1] Testing GET /summary...")
    resp = session.get("/summary")
    assert resp.status_code == 200, f"Summary failed: {resp.status_code} - {resp.text}"
    data = resp.json()
    
    # Check required fields
    required_fields = ["kpis", "byMonth", "contribution", "stageCounts", "agingReceivable", "agingPayable", "topProjects"]
    for field in required_fields:
        assert field in data, f"Missing field: {field}"
    
    # Check byMonth (should have 6 entries)
    assert len(data["byMonth"]) == 6, f"Expected 6 months, got {len(data['byMonth'])}"
    print(f"✅ byMonth: {len(data['byMonth'])} entries")
    
    # Check contribution (should have 2 entries: Trading, Logistics)
    assert len(data["contribution"]) == 2, f"Expected 2 business lines, got {len(data['contribution'])}"
    print(f"✅ contribution: {len(data['contribution'])} business lines")
    
    # Check stageCounts (should have 8 stages)
    assert len(data["stageCounts"]) == 8, f"Expected 8 stages, got {len(data['stageCounts'])}"
    print(f"✅ stageCounts: {len(data['stageCounts'])} stages")
    
    # Check agingReceivable (should have 5 buckets)
    assert len(data["agingReceivable"]) == 5, f"Expected 5 aging buckets, got {len(data['agingReceivable'])}"
    print(f"✅ agingReceivable: {len(data['agingReceivable'])} buckets")
    
    # Check agingPayable (should have 5 buckets)
    assert len(data["agingPayable"]) == 5, f"Expected 5 aging buckets, got {len(data['agingPayable'])}"
    print(f"✅ agingPayable: {len(data['agingPayable'])} buckets")
    
    # Check topProjects
    assert isinstance(data["topProjects"], list), "topProjects should be a list"
    print(f"✅ topProjects: {len(data['topProjects'])} projects")
    
    print("\n✅ ALL SUMMARY TESTS PASSED")


def test_lists(session: TestSession):
    """Test 4: List endpoints with filters and pagination"""
    print("\n" + "="*80)
    print("TEST 4: LIST ENDPOINTS")
    print("="*80)
    
    # Test GET /projects
    print("\n[4.1] Testing GET /projects...")
    resp = session.get("/projects")
    assert resp.status_code == 200, f"GET /projects failed: {resp.status_code}"
    data = resp.json()
    assert "items" in data and "total" in data, "Missing items or total"
    assert data["total"] == 10, f"Expected 10 projects, got {data['total']}"
    print(f"✅ GET /projects: {data['total']} items")
    
    # Test GET /quotations
    print("\n[4.2] Testing GET /quotations...")
    resp = session.get("/quotations")
    assert resp.status_code == 200, f"GET /quotations failed: {resp.status_code}"
    data = resp.json()
    assert data["total"] == 12, f"Expected 12 quotations, got {data['total']}"
    # Check each quotation has margin, marginPct, docCount, project
    for item in data["items"]:
        assert "margin" in item and "marginPct" in item, "Missing margin fields"
        assert "docCount" in item, "Missing docCount"
        assert "project" in item, "Missing project object"
    print(f"✅ GET /quotations: {data['total']} items with margin, marginPct, docCount, project")
    
    # Test GET /pos
    print("\n[4.3] Testing GET /pos...")
    resp = session.get("/pos")
    assert resp.status_code == 200, f"GET /pos failed: {resp.status_code}"
    data = resp.json()
    assert data["total"] == 8, f"Expected 8 POs, got {data['total']}"
    # Check each PO has deliveredQty, remainingQty, completionPct
    for item in data["items"]:
        assert "deliveredQty" in item and "remainingQty" in item and "completionPct" in item, "Missing qty fields"
    print(f"✅ GET /pos: {data['total']} items with deliveredQty, remainingQty, completionPct")
    
    # Test other list endpoints
    endpoints = [
        ("/schedules", 10),
        ("/basts", 6),
        ("/invoices-in", 5),
        ("/invoices-out", 5),
        ("/stocks", 3),
        ("/approaches", 20),
    ]
    
    for endpoint, expected_count in endpoints:
        print(f"\n[4.{endpoints.index((endpoint, expected_count)) + 4}] Testing GET {endpoint}...")
        resp = session.get(endpoint)
        assert resp.status_code == 200, f"GET {endpoint} failed: {resp.status_code}"
        data = resp.json()
        assert data["total"] == expected_count, f"Expected {expected_count} items, got {data['total']}"
        print(f"✅ GET {endpoint}: {data['total']} items")
    
    # Test filters
    print("\n[4.10] Testing GET /quotations?filter=noDoc...")
    resp = session.get("/quotations?filter=noDoc")
    assert resp.status_code == 200, f"Filter failed: {resp.status_code}"
    data = resp.json()
    assert data["total"] == 2, f"Expected 2 quotations without docs, got {data['total']}"
    print(f"✅ Filter noDoc: {data['total']} quotations without documents")
    
    print("\n[4.11] Testing GET /pos?filter=noSchedule...")
    resp = session.get("/pos?filter=noSchedule")
    assert resp.status_code == 200, f"Filter failed: {resp.status_code}"
    data = resp.json()
    assert data["total"] == 1, f"Expected 1 PO without schedule, got {data['total']}"
    if data["total"] > 0:
        assert data["items"][0]["poNumber"] == "PO-GU-1188", f"Expected PO-GU-1188, got {data['items'][0]['poNumber']}"
    print(f"✅ Filter noSchedule: {data['total']} PO (PO-GU-1188)")
    
    print("\n[4.12] Testing GET /invoices-out?filter=overdue...")
    resp = session.get("/invoices-out?filter=overdue")
    assert resp.status_code == 200, f"Filter failed: {resp.status_code}"
    data = resp.json()
    assert data["total"] >= 1, f"Expected at least 1 overdue invoice, got {data['total']}"
    print(f"✅ Filter overdue: {data['total']} overdue invoices")
    
    print("\n[4.13] Testing GET /schedules?filter=overdue...")
    resp = session.get("/schedules?filter=overdue")
    assert resp.status_code == 200, f"Filter failed: {resp.status_code}"
    data = resp.json()
    print(f"✅ Filter overdue schedules: {data['total']} items")
    
    print("\n[4.14] Testing GET /basts?filter=missing...")
    resp = session.get("/basts?filter=missing")
    assert resp.status_code == 200, f"Filter failed: {resp.status_code}"
    data = resp.json()
    assert "pendingSchedules" in data, "Missing pendingSchedules array"
    print(f"✅ Filter missing BASTs: {len(data['pendingSchedules'])} pending schedules")
    
    # Test search
    print("\n[4.15] Testing GET /quotations?q=Q-2503-001...")
    resp = session.get("/quotations?q=Q-2503-001")
    assert resp.status_code == 200, f"Search failed: {resp.status_code}"
    data = resp.json()
    assert data["total"] == 1, f"Expected 1 result, got {data['total']}"
    print(f"✅ Search q=Q-2503-001: {data['total']} result")
    
    # Test pagination
    print("\n[4.16] Testing GET /approaches?page=1&limit=5...")
    resp = session.get("/approaches?page=1&limit=5")
    assert resp.status_code == 200, f"Pagination failed: {resp.status_code}"
    data = resp.json()
    assert len(data["items"]) == 5, f"Expected 5 items, got {len(data['items'])}"
    assert data["total"] == 20, f"Expected total 20, got {data['total']}"
    print(f"✅ Pagination: {len(data['items'])} items, total {data['total']}")
    
    print("\n✅ ALL LIST TESTS PASSED")


def test_crud_flow(session: TestSession):
    """Test 5: Full CRUD flow with cleanup"""
    print("\n" + "="*80)
    print("TEST 5: CRUD FLOW")
    print("="*80)
    
    # 5a. Create quotation without projectId (should auto-create project)
    print("\n[5a] Creating quotation without projectId (auto-create project)...")
    quotation_data = {
        "customer": "PT Test Corp",
        "projectName": "Test Project Supply",
        "salesPic": "Andi Pratama",
        "businessLine": "Trading",
        "quotationNumber": "Q-TEST-001",
        "revenue": 1000000000,
        "hpp": 800000000,
        "status": "Draft"
    }
    resp = session.post("/quotations", json=quotation_data)
    assert resp.status_code == 201, f"Create quotation failed: {resp.status_code} - {resp.text}"
    quotation = resp.json()
    assert "id" in quotation and "projectId" in quotation, "Missing id or projectId"
    assert quotation["margin"] == 200000000, f"Expected margin 200000000, got {quotation['margin']}"
    assert quotation["marginPct"] == 20, f"Expected marginPct 20, got {quotation['marginPct']}"
    project_id = quotation["projectId"]
    quotation_id = quotation["id"]
    created_resources["quotations"].append(quotation_id)
    created_resources["projects"].append(project_id)
    print(f"✅ Quotation created: id={quotation_id}, projectId={project_id}, margin={quotation['margin']}, marginPct={quotation['marginPct']}%")
    
    # 5b. Get project full detail
    print("\n[5b] Getting project full detail...")
    resp = session.get(f"/projects/{project_id}/full")
    assert resp.status_code == 200, f"Get project full failed: {resp.status_code}"
    project_full = resp.json()
    assert "project" in project_full, "Missing project"
    project = project_full["project"]
    assert project["revenue"] == 1000000000, f"Expected revenue 1000000000, got {project['revenue']}"
    assert project["currentStage"] == "Penawaran", f"Expected stage Penawaran, got {project['currentStage']}"
    assert project["status"] == "Belum Jalan", f"Expected status Belum Jalan, got {project['status']}"
    assert len(project_full["quotations"]) == 1, f"Expected 1 quotation, got {len(project_full['quotations'])}"
    print(f"✅ Project full: revenue={project['revenue']}, stage={project['currentStage']}, status={project['status']}, quotations={len(project_full['quotations'])}")
    
    # 5c. Update quotation
    print("\n[5c] Updating quotation (status=Approved, hpp=700000000)...")
    resp = session.put(f"/quotations/{quotation_id}", json={"status": "Approved", "hpp": 700000000})
    assert resp.status_code == 200, f"Update quotation failed: {resp.status_code} - {resp.text}"
    updated_quotation = resp.json()
    assert updated_quotation["margin"] == 300000000, f"Expected margin 300000000, got {updated_quotation['margin']}"
    assert updated_quotation["marginPct"] == 30, f"Expected marginPct 30, got {updated_quotation['marginPct']}"
    print(f"✅ Quotation updated: margin={updated_quotation['margin']}, marginPct={updated_quotation['marginPct']}%")
    
    # 5d. Convert quotation to PO (get prefill)
    print("\n[5d] Converting quotation to PO (get prefill)...")
    resp = session.post(f"/quotations/{quotation_id}/convert-po")
    assert resp.status_code == 200, f"Convert to PO failed: {resp.status_code}"
    prefill = resp.json()
    assert "prefill" in prefill, "Missing prefill"
    assert prefill["prefill"]["projectId"] == project_id, "ProjectId mismatch"
    assert prefill["prefill"]["poValue"] == 1000000000, f"Expected poValue 1000000000, got {prefill['prefill']['poValue']}"
    print(f"✅ Convert to PO prefill: projectId={prefill['prefill']['projectId']}, poValue={prefill['prefill']['poValue']}")
    
    # 5e. Create PO
    print("\n[5e] Creating PO...")
    po_data = {
        "projectId": project_id,
        "customer": "PT Test Corp",
        "poNumber": "PO-TEST-1",
        "poValue": 1000000000,
        "quantity": 100,
        "unit": "MT",
        "status": "Confirmed"
    }
    resp = session.post("/pos", json=po_data)
    assert resp.status_code == 201, f"Create PO failed: {resp.status_code} - {resp.text}"
    po = resp.json()
    po_id = po["id"]
    created_resources["pos"].append(po_id)
    print(f"✅ PO created: id={po_id}")
    
    # Check project updated
    print("\n[5e-verify] Verifying project after PO creation...")
    resp = session.get(f"/projects/{project_id}/full")
    assert resp.status_code == 200, f"Get project full failed: {resp.status_code}"
    project_full = resp.json()
    project = project_full["project"]
    assert project["poQty"] == 100, f"Expected poQty 100, got {project['poQty']}"
    assert project["status"] == "Ongoing", f"Expected status Ongoing, got {project['status']}"
    assert project["currentStage"] == "PO", f"Expected stage PO, got {project['currentStage']}"
    print(f"✅ Project updated: poQty={project['poQty']}, status={project['status']}, stage={project['currentStage']}")
    
    # 5f. Create schedule
    print("\n[5f] Creating schedule (Delivered, qty=40)...")
    schedule_data = {
        "projectId": project_id,
        "poId": po_id,
        "deliveryNumber": "DLV-T1",
        "scheduleDate": "2025-01-01",
        "qty": 40,
        "unit": "MT",
        "status": "Delivered"
    }
    resp = session.post("/schedules", json=schedule_data)
    assert resp.status_code == 201, f"Create schedule failed: {resp.status_code} - {resp.text}"
    schedule = resp.json()
    schedule_id = schedule["id"]
    created_resources["schedules"].append(schedule_id)
    print(f"✅ Schedule created: id={schedule_id}")
    
    # Check project updated
    print("\n[5f-verify] Verifying project after schedule creation...")
    resp = session.get(f"/projects/{project_id}/full")
    assert resp.status_code == 200, f"Get project full failed: {resp.status_code}"
    project_full = resp.json()
    project = project_full["project"]
    assert project["deliveredQty"] == 40, f"Expected deliveredQty 40, got {project['deliveredQty']}"
    assert project["remainingQty"] == 60, f"Expected remainingQty 60, got {project['remainingQty']}"
    assert project["completionPct"] == 40, f"Expected completionPct 40, got {project['completionPct']}"
    assert project["status"] == "Partial", f"Expected status Partial, got {project['status']}"
    assert project["currentStage"] == "Schedule", f"Expected stage Schedule, got {project['currentStage']}"
    print(f"✅ Project updated: deliveredQty={project['deliveredQty']}, remainingQty={project['remainingQty']}, completionPct={project['completionPct']}%, status={project['status']}")
    
    # Check PO updated
    print("\n[5f-verify-po] Verifying PO after schedule creation...")
    resp = session.get("/pos?q=PO-TEST-1")
    assert resp.status_code == 200, f"Get PO failed: {resp.status_code}"
    data = resp.json()
    assert data["total"] == 1, f"Expected 1 PO, got {data['total']}"
    po_item = data["items"][0]
    assert po_item["deliveredQty"] == 40, f"Expected deliveredQty 40, got {po_item['deliveredQty']}"
    print(f"✅ PO updated: deliveredQty={po_item['deliveredQty']}")
    
    # 5g. Create invoice-out
    print("\n[5g] Creating invoice-out (overdue)...")
    invoice_out_data = {
        "projectId": project_id,
        "customer": "PT Test Corp",
        "invoiceNumber": "INV-T-1",
        "invoiceDate": "2025-01-05",
        "dueDate": "2025-01-20",  # Past date, should be overdue
        "amount": 500000000,
        "paidAmount": 200000000,
        "status": "Sent"
    }
    resp = session.post("/invoices-out", json=invoice_out_data)
    assert resp.status_code == 201, f"Create invoice-out failed: {resp.status_code} - {resp.text}"
    invoice_out = resp.json()
    invoice_out_id = invoice_out["id"]
    created_resources["invoices-out"].append(invoice_out_id)
    assert invoice_out["outstanding"] == 300000000, f"Expected outstanding 300000000, got {invoice_out['outstanding']}"
    assert invoice_out["status"] == "Overdue", f"Expected status Overdue (auto-set), got {invoice_out['status']}"
    print(f"✅ Invoice-out created: id={invoice_out_id}, outstanding={invoice_out['outstanding']}, status={invoice_out['status']}")
    
    # Update invoice-out to fully paid
    print("\n[5g-update] Updating invoice-out to fully paid...")
    resp = session.put(f"/invoices-out/{invoice_out_id}", json={"paidAmount": 500000000})
    assert resp.status_code == 200, f"Update invoice-out failed: {resp.status_code}"
    updated_invoice = resp.json()
    assert updated_invoice["outstanding"] == 0, f"Expected outstanding 0, got {updated_invoice['outstanding']}"
    assert updated_invoice["status"] == "Paid", f"Expected status Paid, got {updated_invoice['status']}"
    print(f"✅ Invoice-out updated: outstanding={updated_invoice['outstanding']}, status={updated_invoice['status']}")
    
    # 5h. Create invoice-in
    print("\n[5h] Creating invoice-in...")
    invoice_in_data = {
        "projectId": project_id,
        "vendor": "PT Vendor Test",
        "invoiceNumber": "INV-V-1",
        "amount": 100000000,
        "paidAmount": 0,
        "dueDate": "2099-01-01",
        "status": "Received"
    }
    resp = session.post("/invoices-in", json=invoice_in_data)
    assert resp.status_code == 201, f"Create invoice-in failed: {resp.status_code} - {resp.text}"
    invoice_in = resp.json()
    invoice_in_id = invoice_in["id"]
    created_resources["invoices-in"].append(invoice_in_id)
    assert invoice_in["outstanding"] == 100000000, f"Expected outstanding 100000000, got {invoice_in['outstanding']}"
    assert invoice_in["status"] == "Received", f"Expected status Received, got {invoice_in['status']}"
    print(f"✅ Invoice-in created: id={invoice_in_id}, outstanding={invoice_in['outstanding']}, status={invoice_in['status']}")
    
    # 5i. Create approach and convert
    print("\n[5i] Creating approach...")
    approach_data = {
        "companyName": "PT Lead Test",
        "opportunity": "Test Opp",
        "salesPic": "Budi Santoso",
        "businessLine": "Logistics",
        "status": "New"
    }
    resp = session.post("/approaches", json=approach_data)
    assert resp.status_code == 201, f"Create approach failed: {resp.status_code} - {resp.text}"
    approach = resp.json()
    approach_id = approach["id"]
    created_resources["approaches"].append(approach_id)
    print(f"✅ Approach created: id={approach_id}")
    
    # Convert approach
    print("\n[5i-convert] Converting approach to project...")
    resp = session.post(f"/approaches/{approach_id}/convert")
    assert resp.status_code == 200, f"Convert approach failed: {resp.status_code}"
    convert_result = resp.json()
    assert "project" in convert_result and "prefill" in convert_result, "Missing project or prefill"
    new_project_id = convert_result["project"]["id"]
    created_resources["projects"].append(new_project_id)
    print(f"✅ Approach converted: new projectId={new_project_id}")
    
    # Verify approach status changed to Qualified
    resp = session.get(f"/approaches/{approach_id}")
    assert resp.status_code == 200, f"Get approach failed: {resp.status_code}"
    approach_updated = resp.json()
    assert approach_updated["status"] == "Qualified", f"Expected status Qualified, got {approach_updated['status']}"
    print(f"✅ Approach status updated to Qualified")
    
    print("\n✅ ALL CRUD FLOW TESTS PASSED")
    return quotation_id, project_id


def test_file_upload(session: TestSession, quotation_id: str):
    """Test 5j: File upload/download/delete"""
    print("\n" + "="*80)
    print("TEST 5j: FILE UPLOAD")
    print("="*80)
    
    # Create a small test file
    print("\n[5j.1] Creating and uploading test file...")
    test_content = b"Test PDF content for Across Pipeline Dashboard"
    files = {"file": ("test-quotation.pdf", io.BytesIO(test_content), "application/pdf")}
    data = {
        "entityType": "quotations",
        "entityId": quotation_id,
        "category": "Quotation"
    }
    
    # Upload file (need to use requests directly for multipart)
    headers = {"Authorization": f"Bearer {session.token}"}
    resp = requests.post(f"{BASE_URL}/upload", headers=headers, files=files, data=data, timeout=10)
    assert resp.status_code == 201, f"Upload failed: {resp.status_code} - {resp.text}"
    doc = resp.json()
    assert "id" in doc and "fileName" in doc and "size" in doc, "Missing doc fields"
    doc_id = doc["id"]
    created_resources["documents"].append(doc_id)
    print(f"✅ File uploaded: id={doc_id}, fileName={doc['fileName']}, size={doc['size']}")
    
    # Get documents for quotation
    print("\n[5j.2] Getting documents for quotation...")
    resp = session.get(f"/documents?entityId={quotation_id}")
    assert resp.status_code == 200, f"Get documents failed: {resp.status_code}"
    docs = resp.json()
    assert len(docs) == 1, f"Expected 1 document, got {len(docs)}"
    print(f"✅ Documents retrieved: {len(docs)} document(s)")
    
    # Download file (inline)
    print("\n[5j.3] Downloading file (inline)...")
    resp = session.get(f"/files/{doc_id}")
    assert resp.status_code == 200, f"Download failed: {resp.status_code}"
    assert len(resp.content) == len(test_content), f"Content size mismatch"
    print(f"✅ File downloaded (inline): {len(resp.content)} bytes")
    
    # Download file (attachment)
    print("\n[5j.4] Downloading file (attachment)...")
    resp = session.get(f"/files/{doc_id}?download=1")
    assert resp.status_code == 200, f"Download failed: {resp.status_code}"
    assert "Content-Disposition" in resp.headers, "Missing Content-Disposition header"
    assert "attachment" in resp.headers["Content-Disposition"], "Not an attachment"
    print(f"✅ File downloaded (attachment): Content-Disposition={resp.headers['Content-Disposition']}")
    
    # Verify quotation no longer in noDoc filter
    print("\n[5j.5] Verifying quotation not in noDoc filter...")
    resp = session.get("/quotations?filter=noDoc")
    assert resp.status_code == 200, f"Filter failed: {resp.status_code}"
    data = resp.json()
    quotation_ids = [q["id"] for q in data["items"]]
    assert quotation_id not in quotation_ids, "Quotation should not be in noDoc filter"
    print(f"✅ Quotation not in noDoc filter")
    
    # Delete document
    print("\n[5j.6] Deleting document...")
    resp = session.delete(f"/documents/{doc_id}")
    assert resp.status_code == 200, f"Delete document failed: {resp.status_code}"
    print(f"✅ Document deleted")
    
    # Remove from cleanup list
    created_resources["documents"].remove(doc_id)
    
    print("\n✅ ALL FILE UPLOAD TESTS PASSED")


def test_search(session: TestSession):
    """Test 5k: Search functionality"""
    print("\n" + "="*80)
    print("TEST 5k: SEARCH")
    print("="*80)
    
    print("\n[5k] Testing GET /search?q=PO-TEST...")
    resp = session.get("/search?q=PO-TEST")
    assert resp.status_code == 200, f"Search failed: {resp.status_code}"
    results = resp.json()
    assert isinstance(results, list), "Results should be a list"
    # Should find the PO we created
    po_results = [r for r in results if r["type"] == "PO"]
    assert len(po_results) >= 1, f"Expected at least 1 PO result, got {len(po_results)}"
    print(f"✅ Search results: {len(results)} total, {len(po_results)} PO(s)")
    
    print("\n✅ ALL SEARCH TESTS PASSED")


def test_settings(session: TestSession):
    """Test 5l: Settings"""
    print("\n" + "="*80)
    print("TEST 5l: SETTINGS")
    print("="*80)
    
    # Get current settings
    print("\n[5l.1] Getting current settings...")
    resp = session.get("/settings")
    assert resp.status_code == 200, f"Get settings failed: {resp.status_code}"
    settings = resp.json()
    assert "revenueBasis" in settings, "Missing revenueBasis"
    original_basis = settings["revenueBasis"]
    print(f"✅ Current settings: revenueBasis={original_basis}")
    
    # Get current dashboard omzet
    resp = session.get("/dashboard?businessLine=All&period=all")
    assert resp.status_code == 200, f"Dashboard failed: {resp.status_code}"
    original_omzet = resp.json()["kpis"]["omzet"]
    print(f"✅ Current omzet (basis={original_basis}): {original_omzet}")
    
    # Change to po_value
    print("\n[5l.2] Changing revenueBasis to po_value...")
    resp = session.put("/settings", json={"revenueBasis": "po_value"})
    assert resp.status_code == 200, f"Update settings failed: {resp.status_code}"
    updated_settings = resp.json()
    assert updated_settings["revenueBasis"] == "po_value", "revenueBasis not updated"
    print(f"✅ Settings updated: revenueBasis=po_value")
    
    # Check dashboard omzet changed
    resp = session.get("/dashboard?businessLine=All&period=all")
    assert resp.status_code == 200, f"Dashboard failed: {resp.status_code}"
    new_omzet = resp.json()["kpis"]["omzet"]
    print(f"✅ New omzet (basis=po_value): {new_omzet}")
    # Omzet should be different (unless by coincidence they're equal)
    # We won't assert they're different as it depends on data
    
    # Change back to original
    print("\n[5l.3] Changing revenueBasis back to invoice_out...")
    resp = session.put("/settings", json={"revenueBasis": "invoice_out"})
    assert resp.status_code == 200, f"Update settings failed: {resp.status_code}"
    print(f"✅ Settings restored: revenueBasis=invoice_out")
    
    print("\n✅ ALL SETTINGS TESTS PASSED")


def cleanup(session: TestSession):
    """Test 5m: Cleanup created resources"""
    print("\n" + "="*80)
    print("TEST 5m: CLEANUP")
    print("="*80)
    
    # Delete in reverse order of dependencies
    for resource_type in ["schedules", "invoices-out", "invoices-in", "pos", "quotations", "approaches", "documents"]:
        for resource_id in created_resources[resource_type]:
            print(f"Deleting {resource_type}/{resource_id}...")
            try:
                resp = session.delete(f"/{resource_type}/{resource_id}")
                if resp.status_code == 200:
                    print(f"✅ Deleted {resource_type}/{resource_id}")
                else:
                    print(f"⚠️  Failed to delete {resource_type}/{resource_id}: {resp.status_code}")
            except Exception as e:
                print(f"⚠️  Error deleting {resource_type}/{resource_id}: {e}")
    
    # Delete projects last
    for project_id in created_resources["projects"]:
        print(f"Deleting project {project_id}...")
        try:
            resp = session.delete(f"/projects/{project_id}")
            if resp.status_code == 200:
                print(f"✅ Deleted project {project_id}")
            else:
                print(f"⚠️  Failed to delete project {project_id}: {resp.status_code}")
        except Exception as e:
            print(f"⚠️  Error deleting project {project_id}: {e}")
    
    # Verify project count back to 10
    print("\n[5m-verify] Verifying project count back to 10...")
    resp = session.get("/projects")
    if resp.status_code == 200:
        data = resp.json()
        if data["total"] == 10:
            print(f"✅ Project count verified: {data['total']} projects")
        else:
            print(f"⚠️  Project count mismatch: expected 10, got {data['total']}")
    
    print("\n✅ CLEANUP COMPLETE")


def test_rbac():
    """Test 6: Role-Based Access Control"""
    print("\n" + "="*80)
    print("TEST 6: RBAC (Role-Based Access Control)")
    print("="*80)
    
    # Test management role (read-only)
    print("\n[6.1] Testing management role (read-only)...")
    mgmt = TestSession("management")
    assert mgmt.login(**USERS["management"]), "Management login failed"
    
    # Should be able to read
    resp = mgmt.get("/quotations")
    assert resp.status_code == 200, f"Management read failed: {resp.status_code}"
    print(f"✅ Management can read lists")
    
    # Should NOT be able to write
    resp = mgmt.post("/quotations", json={"customer": "Test", "revenue": 1000000})
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
    print(f"✅ Management cannot create quotations (403)")
    
    # Should NOT be able to upload
    test_content = b"Test"
    files = {"file": ("test.pdf", io.BytesIO(test_content), "application/pdf")}
    headers = {"Authorization": f"Bearer {mgmt.token}"}
    resp = requests.post(f"{BASE_URL}/upload", headers=headers, files=files, data={"entityType": "quotations"}, timeout=10)
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
    print(f"✅ Management cannot upload files (403)")
    
    # Test sales role
    print("\n[6.2] Testing sales role...")
    sales = TestSession("sales")
    assert sales.login(**USERS["sales"]), "Sales login failed"
    
    # Sales can create approaches
    resp = sales.post("/approaches", json={"companyName": "PT Sales Test", "opportunity": "Test", "salesPic": "Andi Pratama", "businessLine": "Trading", "status": "New"})
    assert resp.status_code == 201, f"Sales create approach failed: {resp.status_code}"
    approach_id = resp.json()["id"]
    print(f"✅ Sales can create approaches")
    
    # Sales cannot create schedules
    resp = sales.post("/schedules", json={"projectId": "test", "deliveryNumber": "TEST", "qty": 10})
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
    print(f"✅ Sales cannot create schedules (403)")
    
    # Cleanup approach
    resp = sales.delete(f"/approaches/{approach_id}")
    assert resp.status_code == 200, f"Delete approach failed: {resp.status_code}"
    print(f"✅ Sales deleted test approach")
    
    # Test ops role
    print("\n[6.3] Testing operations role...")
    ops = TestSession("ops")
    assert ops.login(**USERS["ops"]), "Ops login failed"
    
    # Ops cannot create invoices-out
    resp = ops.post("/invoices-out", json={"customer": "Test", "invoiceNumber": "TEST", "amount": 1000000})
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
    print(f"✅ Ops cannot create invoices-out (403)")
    
    # Test finance role
    print("\n[6.4] Testing finance role...")
    finance = TestSession("finance")
    assert finance.login(**USERS["finance"]), "Finance login failed"
    
    # Finance cannot update settings
    resp = finance.put("/settings", json={"revenueBasis": "po_value"})
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
    print(f"✅ Finance cannot update settings (403)")
    
    print("\n✅ ALL RBAC TESTS PASSED")


def main():
    """Main test runner"""
    print("\n" + "="*80)
    print("ACROSS PIPELINE DASHBOARD - BACKEND API TESTS")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    
    try:
        # Test 1: Auth (no session needed)
        test_auth()
        
        # Create admin session for remaining tests
        admin = TestSession("admin")
        if not admin.login(**USERS["admin"]):
            print("\n❌ FATAL: Admin login failed, cannot continue")
            return False
        
        # Test 2-4: Dashboard, Summary, Lists
        test_dashboard(admin)
        test_summary(admin)
        test_lists(admin)
        
        # Test 5: CRUD flow
        quotation_id, project_id = test_crud_flow(admin)
        
        # Test 5j-l: File upload, Search, Settings
        test_file_upload(admin, quotation_id)
        test_search(admin)
        test_settings(admin)
        
        # Test 5m: Cleanup
        cleanup(admin)
        
        # Test 6: RBAC
        test_rbac()
        
        print("\n" + "="*80)
        print("✅ ALL TESTS PASSED SUCCESSFULLY!")
        print("="*80)
        return True
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return False
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
