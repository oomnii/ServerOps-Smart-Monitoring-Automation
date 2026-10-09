"""Prometheus exporter authorization and exposition tests."""

from unittest.mock import patch

from django.test import Client, TestCase, override_settings

from monitor.services import MetricsCollectionError

TOKEN = "test-only-scrape-token"
CPU = {
    "cpu_percent": 12.5,
    "logical_cores": 4,
}
MEMORY = {
    "total_bytes": 1000,
    "used_bytes": 400,
    "available_bytes": 600,
    "memory_percent": 40.0,
}
DISK = {
    "total_bytes": 2000,
    "used_bytes": 500,
    "free_bytes": 1500,
    "disk_percent": 25.0,
}


@override_settings(METRICS_SCRAPE_TOKEN=TOKEN)
class ExporterTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_authorized_scrape_returns_prometheus_text(self):
        with self._fixed_host():
            response = self._scrape(TOKEN)

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/plain", response["Content-Type"])
        body = response.content.decode()
        self.assertIn("serverops_cpu_usage_percent 12.5", body)
        self.assertIn("serverops_memory_usage_percent 40.0", body)
        self.assertIn("serverops_memory_total_bytes 1000.0", body)
        self.assertIn("serverops_memory_used_bytes 400.0", body)
        self.assertIn("serverops_memory_available_bytes 600.0", body)
        self.assertIn("serverops_disk_usage_percent 25.0", body)
        self.assertIn("serverops_disk_total_bytes 2000.0", body)
        self.assertIn("serverops_disk_used_bytes 500.0", body)
        self.assertIn("serverops_disk_free_bytes 1500.0", body)
        self.assertNotIn(TOKEN, body)

    def test_missing_and_wrong_tokens_are_rejected(self):
        missing = self.client.get("/internal/metrics/")
        wrong = self._scrape("not-the-token")

        self.assertEqual(missing.status_code, 401)
        self.assertEqual(wrong.status_code, 401)
        self.assertNotIn(b"serverops_cpu_usage_percent", missing.content)
        self.assertNotIn(b"serverops_cpu_usage_percent", wrong.content)
        self.assertNotIn(TOKEN.encode(), wrong.content)

    @override_settings(METRICS_SCRAPE_TOKEN="")
    def test_missing_configuration_fails_closed(self):
        response = self._scrape(TOKEN)
        self.assertEqual(response.status_code, 401)
        self.assertNotIn(b"serverops_cpu_usage_percent", response.content)

    def test_collection_failure_does_not_invent_readings(self):
        with patch(
            "monitor.exporter.get_cpu_metrics",
            side_effect=MetricsCollectionError("cpu"),
        ):
            response = self._scrape(TOKEN)

        self.assertEqual(response.status_code, 503)
        self.assertNotIn(b"serverops_cpu_usage_percent", response.content)
        self.assertNotIn(b"serverops_memory_usage_percent", response.content)

    def test_api_requests_are_counted_and_the_scrape_is_not(self):
        health = self.client.get("/api/health/")
        self.assertEqual(health.status_code, 200)
        with self._fixed_host():
            first = self._scrape(TOKEN)
            second = self._scrape(TOKEN)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        body = second.content.decode()
        self.assertIn('serverops_http_requests_total{method="GET",route="health",status="2xx"}', body)
        self.assertIn("serverops_http_request_duration_seconds", body)
        self.assertNotIn('route="prometheus-metrics"', body)
        first_health = _sample(first.content, 'route="health"')
        second_health = _sample(second.content, 'route="health"')
        self.assertEqual(first_health, second_health)

    def test_json_metrics_remain_protected(self):
        response = self.client.get("/api/metrics/")
        self.assertEqual(response.status_code, 401)

    def _scrape(self, token):
        return self.client.get(
            "/internal/metrics/",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )

    def _fixed_host(self):
        return patch.multiple(
            "monitor.exporter",
            get_cpu_metrics=lambda: CPU,
            get_memory_metrics=lambda: MEMORY,
            get_disk_metrics=lambda: DISK,
        )


def _sample(payload, marker):
    for line in payload.decode().splitlines():
        if line.startswith("serverops_http_requests_total{") and marker in line:
            return line.split()[-1]
    return None
