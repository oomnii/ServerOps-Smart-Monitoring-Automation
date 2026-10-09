"""Predictable API tests. Live host checks are limited to stable totals."""

import os
import re
from types import SimpleNamespace
from unittest.mock import patch

import psutil
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from monitor.auth_tests import AuthApiTests
from monitor.exporter_tests import ExporterTests

# Django loads monitor.tests for this app, so these cases must be referenced here.
DISCOVERED_TEST_CASES = (AuthApiTests, ExporterTests)

from monitor.services import CPU_SAMPLE_SECONDS

UTC_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


class ApiTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()


class StaffApiTestCase(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(
            username="metrics-admin",
            password="test-only-metrics-admin",
            is_staff=True,
            is_active=True,
        )
        self.client.force_login(self.admin)


class HealthEndpointTests(ApiTestCase):
    def test_health_returns_service_status(self):
        response = self.client.get("/api/health/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            {"status": "ok", "service": "serverops-api"},
        )


class CpuEndpointTests(StaffApiTestCase):
    @patch("monitor.services.psutil.cpu_percent", return_value=12.34)
    @patch("monitor.services.psutil.cpu_count", return_value=8)
    def test_cpu_returns_numeric_sample(self, mock_count, mock_percent):
        response = self.client.get("/api/metrics/cpu/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            {"cpu_percent": 12.3, "logical_cores": 8},
        )
        self.assertIsInstance(response.data["cpu_percent"], float)
        self.assertIsInstance(response.data["logical_cores"], int)
        mock_percent.assert_called_once_with(interval=CPU_SAMPLE_SECONDS)
        self.assertGreater(CPU_SAMPLE_SECONDS, 0)
        self.assertLessEqual(CPU_SAMPLE_SECONDS, 0.5)
        mock_count.assert_called_once_with(logical=True)


class MemoryEndpointTests(StaffApiTestCase):
    @patch(
        "monitor.services.psutil.virtual_memory",
        return_value=SimpleNamespace(
            total=1_000_000,
            used=400_000,
            available=600_000,
            percent=40,
        ),
    )
    def test_memory_returns_byte_fields(self, _mock_memory):
        response = self.client.get("/api/metrics/memory/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            {
                "total_bytes": 1_000_000,
                "used_bytes": 400_000,
                "available_bytes": 600_000,
                "memory_percent": 40.0,
            },
        )


class DiskEndpointTests(StaffApiTestCase):
    @patch(
        "monitor.services.psutil.disk_usage",
        return_value=SimpleNamespace(
            total=2_000_000,
            used=500_000,
            free=1_500_000,
            percent=25,
        ),
    )
    def test_disk_reads_the_windows_system_drive(self, mock_disk):
        response = self.client.get("/api/metrics/disk/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            {
                "total_bytes": 2_000_000,
                "used_bytes": 500_000,
                "free_bytes": 1_500_000,
                "disk_percent": 25.0,
            },
        )
        path = mock_disk.call_args.args[0]
        self.assertNotEqual(path, "/")
        self.assertTrue(path.endswith("\\"))


class CombinedEndpointTests(StaffApiTestCase):
    @patch("monitor.services.psutil.cpu_percent", return_value=10)
    @patch("monitor.services.psutil.cpu_count", return_value=4)
    @patch(
        "monitor.services.psutil.virtual_memory",
        return_value=SimpleNamespace(
            total=100,
            used=25,
            available=75,
            percent=25,
        ),
    )
    @patch(
        "monitor.services.psutil.disk_usage",
        return_value=SimpleNamespace(
            total=200,
            used=50,
            free=150,
            percent=25,
        ),
    )
    def test_combined_snapshot_has_every_section(
        self,
        _mock_disk,
        _mock_memory,
        _mock_cores,
        _mock_percent,
    ):
        response = self.client.get("/api/metrics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"timestamp_utc", "cpu", "memory", "disk"})
        self.assertRegex(response.data["timestamp_utc"], UTC_TIMESTAMP)
        self.assertEqual(response.data["cpu"]["logical_cores"], 4)
        self.assertEqual(response.data["memory"]["total_bytes"], 100)
        self.assertEqual(response.data["disk"]["free_bytes"], 150)


class MethodNotAllowedTests(StaffApiTestCase):
    def test_health_rejects_writes_without_authentication(self):
        anonymous = APIClient()
        for method in ("post", "put", "patch", "delete"):
            response = getattr(anonymous, method)("/api/health/", {}, format="json")
            self.assertEqual(response.status_code, 405, method.upper())
            self.assertIn("detail", response.data)

    def test_metrics_reject_writes_for_an_admin(self):
        for path in (
            "/api/metrics/cpu/",
            "/api/metrics/memory/",
            "/api/metrics/disk/",
            "/api/metrics/",
        ):
            for method in ("post", "put", "patch", "delete"):
                response = getattr(self.client, method)(path, {}, format="json")
                self.assertEqual(response.status_code, 405, f"{method.upper()} {path}")
                self.assertIn("detail", response.data)


class MetricsFailureTests(StaffApiTestCase):
    @patch(
        "monitor.services.psutil.cpu_percent",
        side_effect=OSError(r"C:\Users\secret\cpu-denied"),
    )
    def test_cpu_failure_is_a_controlled_error(self, _mock_percent):
        response = self.client.get("/api/metrics/cpu/")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data, {"detail": "Unable to collect CPU metrics."})
        self.assertNotIn(b"secret", response.content)
        self.assertNotIn(b"Traceback", response.content)

    @patch("monitor.services.psutil.cpu_percent", return_value=150)
    @patch("monitor.services.psutil.cpu_count", return_value=8)
    def test_out_of_range_cpu_is_rejected(self, _mock_count, _mock_percent):
        response = self.client.get("/api/metrics/cpu/")

        self.assertEqual(response.status_code, 503)
        self.assertNotIn("cpu_percent", response.data)

    @patch(
        "monitor.services.psutil.virtual_memory",
        side_effect=psutil.Error("memory device hidden"),
    )
    def test_memory_failure_is_a_controlled_error(self, _mock_memory):
        response = self.client.get("/api/metrics/memory/")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.data,
            {"detail": "Unable to collect memory metrics."},
        )
        self.assertNotIn(b"hidden", response.content)

    @patch(
        "monitor.services.psutil.disk_usage",
        side_effect=OSError(r"D:\private\disk"),
    )
    def test_disk_failure_does_not_invent_values(self, _mock_disk):
        response = self.client.get("/api/metrics/disk/")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data, {"detail": "Unable to collect disk metrics."})
        self.assertNotIn(b"private", response.content)

    @patch("monitor.services.psutil.cpu_percent", return_value=5)
    @patch("monitor.services.psutil.cpu_count", return_value=2)
    @patch("monitor.services.psutil.virtual_memory", side_effect=OSError("ram failed"))
    def test_combined_failure_returns_no_partial_snapshot(
        self,
        _mock_memory,
        _mock_cores,
        _mock_percent,
    ):
        response = self.client.get("/api/metrics/")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.data,
            {"detail": "Unable to collect memory metrics."},
        )

    @patch(
        "monitor.views.get_cpu_metrics",
        side_effect=RuntimeError(r"C:\secret\exploded"),
    )
    def test_unexpected_error_hides_internals(self, _mock_cpu):
        response = self.client.get("/api/metrics/cpu/")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data, {"error": "Internal server error."})
        self.assertNotIn(b"secret", response.content)
        self.assertNotIn(b"Traceback", response.content)


class LocalSecurityTests(ApiTestCase):
    def test_cors_allows_only_the_local_vite_origins(self):
        allowed = self.client.get(
            "/api/health/",
            HTTP_ORIGIN="http://127.0.0.1:5173",
        )
        blocked = self.client.get(
            "/api/health/",
            HTTP_ORIGIN="https://example.com",
        )

        self.assertEqual(
            allowed["Access-Control-Allow-Origin"],
            "http://127.0.0.1:5173",
        )
        self.assertNotIn("Access-Control-Allow-Origin", blocked)


class LiveHostMetricsTests(StaffApiTestCase):
    def test_live_snapshot_matches_this_computer(self):
        response = self.client.get("/api/metrics/")
        self.assertEqual(response.status_code, 200)

        drive = os.environ.get("SystemDrive", "C:") + "\\"
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage(drive)

        self.assertEqual(response.data["cpu"]["logical_cores"], psutil.cpu_count())
        self.assertGreaterEqual(response.data["cpu"]["cpu_percent"], 0)
        self.assertLessEqual(response.data["cpu"]["cpu_percent"], 100)
        self.assertEqual(response.data["memory"]["total_bytes"], memory.total)
        self.assertEqual(response.data["disk"]["total_bytes"], disk.total)
        self.assertGreater(response.data["memory"]["total_bytes"], 0)
        self.assertGreater(response.data["disk"]["total_bytes"], 0)
        self.assertRegex(response.data["timestamp_utc"], UTC_TIMESTAMP)
