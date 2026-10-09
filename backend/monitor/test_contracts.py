"""Extra API, CSRF, and database-isolation checks for Pytest."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from monitor.auth_tests import TEST_PASSWORD
from monitor.exporter_tests import CPU, DISK, MEMORY, TOKEN


class HealthContractTests(TestCase):
    def test_health_is_public_and_contains_no_metrics(self):
        response = APIClient().get("/api/health/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"status", "service"})
        self.assertEqual(response.data["service"], "serverops-api")
        body = response.content.lower()
        for secret in (b"password", b"secret", b"token", b"cpu", b"memory", b"disk"):
            self.assertNotIn(secret, body)


class AnonymousMetricTests(TestCase):
    def test_each_metric_route_rejects_anonymous_callers(self):
        client = APIClient()
        for path in (
            "/api/metrics/",
            "/api/metrics/cpu/",
            "/api/metrics/memory/",
            "/api/metrics/disk/",
        ):
            response = client.get(path)
            self.assertEqual(response.status_code, 401, path)
            self.assertNotIn(b"cpu_percent", response.content)
            self.assertNotIn(b"total_bytes", response.content)


class CpuSampleWindowTests(TestCase):
    def test_each_reading_uses_a_one_second_blocking_sample(self):
        from monitor.services import CPU_SAMPLE_SECONDS, get_cpu_metrics

        self.assertGreaterEqual(CPU_SAMPLE_SECONDS, 1.0)
        self.assertLess(CPU_SAMPLE_SECONDS, 4.0)
        with (
            patch("monitor.services.psutil.cpu_percent", return_value=12.5) as sample,
            patch("monitor.services.psutil.cpu_count", return_value=4),
        ):
            first = get_cpu_metrics()
            second = get_cpu_metrics()

        self.assertEqual(sample.call_count, 2)
        for call in sample.call_args_list:
            self.assertEqual(call.kwargs, {"interval": CPU_SAMPLE_SECONDS})
            self.assertIsNotNone(call.kwargs["interval"])
            self.assertGreaterEqual(call.kwargs["interval"], 1.0)
        self.assertEqual(first["cpu_percent"], 12.5)
        self.assertEqual(second["cpu_percent"], 12.5)
        self.assertEqual(first["logical_cores"], 4)


class MetricBoundaryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_login(
            User.objects.create_user(
                username="boundary-admin",
                password=TEST_PASSWORD,
                is_staff=True,
                is_active=True,
            )
        )

    @patch("monitor.services.psutil.cpu_count", return_value=4)
    def test_cpu_accepts_zero_and_one_hundred(self, _mock_count):
        for sample in (0, 100):
            with patch("monitor.services.psutil.cpu_percent", return_value=sample):
                response = self.client.get("/api/metrics/cpu/")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["cpu_percent"], float(sample))
            self.assertGreaterEqual(response.data["cpu_percent"], 0)
            self.assertLessEqual(response.data["cpu_percent"], 100)

    def test_mocked_snapshot_uses_nonnegative_bytes(self):
        with (
            patch("monitor.services.psutil.cpu_percent", return_value=0),
            patch("monitor.services.psutil.cpu_count", return_value=2),
            patch(
                "monitor.services.psutil.virtual_memory",
                return_value=SimpleNamespace(
                    total=10, used=0, available=10, percent=0
                ),
            ),
            patch(
                "monitor.services.psutil.disk_usage",
                return_value=SimpleNamespace(
                    total=10, used=0, free=10, percent=0
                ),
            ),
        ):
            response = self.client.get("/api/metrics/")

        self.assertEqual(response.status_code, 200)
        for section in ("memory", "disk"):
            for key, value in response.data[section].items():
                if key.endswith("_bytes"):
                    self.assertIsInstance(value, int)
                    self.assertGreaterEqual(value, 0)
                if key.endswith("_percent"):
                    self.assertGreaterEqual(value, 0)
                    self.assertLessEqual(value, 100)


class CsrfAndMethodTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            username="csrf-staff",
            password=TEST_PASSWORD,
            is_staff=True,
            is_active=True,
        )

    def test_invalid_csrf_token_does_not_create_a_session(self):
        client = APIClient(enforce_csrf_checks=True)
        self.assertEqual(client.get("/api/auth/csrf/").status_code, 200)
        client.credentials(HTTP_X_CSRFTOKEN="not-the-issued-token")

        response = client.post(
            "/api/auth/login/",
            {"username": "csrf-staff", "password": TEST_PASSWORD},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data, {"detail": "CSRF validation failed."})
        self.assertNotIn(b"Traceback", response.content)
        self.assertNotIn(TEST_PASSWORD.encode(), response.content)
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)
        self.assertEqual(client.get("/api/metrics/").status_code, 401)

    def test_auth_routes_reject_the_wrong_method(self):
        client = APIClient()
        login = client.get("/api/auth/login/")
        logout = client.get("/api/auth/logout/")
        me = client.post("/api/auth/me/", {}, format="json")

        self.assertEqual(login.status_code, 405)
        self.assertEqual(logout.status_code, 401)
        self.assertNotEqual(logout.data, {"success": True})
        self.assertEqual(me.status_code, 405)
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)
        self.assertNotIn(b"Traceback", login.content)
        self.assertNotIn(b"Traceback", logout.content)


@override_settings(METRICS_SCRAPE_TOKEN=TOKEN)
class ExporterOutputTests(TestCase):
    def test_exposition_has_metrics_and_no_session_material(self):
        from django.test import Client

        client = Client()
        with (
            patch("monitor.exporter.get_cpu_metrics", return_value=CPU),
            patch("monitor.exporter.get_memory_metrics", return_value=MEMORY),
            patch("monitor.exporter.get_disk_metrics", return_value=DISK),
        ):
            response = client.get(
                "/internal/metrics/",
                HTTP_AUTHORIZATION=f"Bearer {TOKEN}",
            )

        self.assertEqual(response.status_code, 200)
        body = response.content.decode()
        self.assertIn("serverops_cpu_usage_percent 12.5", body)
        self.assertIn("serverops_memory_usage_percent 40.0", body)
        self.assertIn("serverops_disk_usage_percent 25.0", body)
        self.assertIn("serverops_http_request_duration_seconds", body)
        lowered = body.lower()
        self.assertNotIn("password", lowered)
        self.assertNotIn("sessionid", lowered)
        self.assertNotIn(TOKEN, body)


class DatabaseIsolationTests(TestCase):
    def test_active_database_is_not_the_development_file(self):
        from django.conf import settings
        from django.db import connection

        active = str(connection.settings_dict["NAME"])
        real = (settings.BASE_DIR / "db.sqlite3").resolve()
        self.assertNotEqual(Path(active).name, real.name)
        self.assertNotEqual(str(Path(active)), str(real))
        if "memory" not in active and not active.startswith("file:"):
            resolved = Path(active).resolve()
            self.assertNotEqual(resolved, real)
            self.assertIn(".test-runtime", resolved.parts)
