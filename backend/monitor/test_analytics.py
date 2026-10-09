"""Analytics history stays on the allowlist and does not invent samples."""

import json
from io import BytesIO
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from monitor.analytics import _RejectRedirects, build_history

FROZEN_TIME = 1_700_000_000


def _matrix(result):
    return {"status": "success", "data": {"resultType": "matrix", "result": result}}


def _opener(payload, status=200):
    if isinstance(payload, bytes):
        body = payload
    else:
        body = json.dumps(payload).encode()
    response = MagicMock()
    response.status = status
    response.read.return_value = body
    response.__enter__.return_value = response
    response.__exit__.return_value = False
    opener = MagicMock()
    opener.open.return_value = response
    return opener


class AnalyticsHistoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username="analytics-staff",
            password="test-only-analytics-staff",
            is_staff=True,
            is_active=True,
        )
        self.regular = User.objects.create_user(
            username="analytics-user",
            password="test-only-analytics-user",
            is_staff=False,
            is_active=True,
        )
        self.inactive = User.objects.create_user(
            username="analytics-inactive",
            password="test-only-analytics-inactive",
            is_staff=True,
            is_active=False,
        )

    def test_anonymous_callers_receive_401(self):
        with patch("monitor.analytics.build_opener") as mocked:
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "cpu", "range": "15m"},
            )
        self.assertEqual(response.status_code, 401)
        mocked.assert_not_called()

    def test_non_staff_users_receive_403(self):
        self.client.force_login(self.regular)
        with patch("monitor.analytics.build_opener") as mocked:
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "memory", "range": "1h"},
            )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "You do not have access to monitoring data.")
        mocked.assert_not_called()

    def test_inactive_staff_are_not_authenticated(self):
        self.client.force_login(self.inactive)
        with patch("monitor.analytics.build_opener") as mocked:
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "disk", "range": "15m"},
            )
        self.assertEqual(response.status_code, 401)
        mocked.assert_not_called()

    def test_valid_ranges_are_accepted(self):
        expected = {"15m": 15, "1h": 30, "6h": 60, "24h": 120}
        self.client.force_login(self.staff)
        for window, step in expected.items():
            with self.subTest(window=window):
                opener = _opener(_matrix([]))
                with (
                    patch("monitor.analytics.build_opener", return_value=opener),
                    patch("monitor.analytics.time.time", return_value=FROZEN_TIME),
                ):
                    response = self.client.get(
                        "/api/analytics/history/",
                        {"metric": "cpu", "range": window},
                    )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data["range"], window)
                self.assertEqual(response.data["step_seconds"], step)
                request = opener.open.call_args.args[0]
                self.assertIn(f"step={step}", request.full_url)
                self.assertEqual(opener.open.call_args.kwargs["timeout"], 5)

    def test_invalid_time_range_is_rejected(self):
        self.client.force_login(self.staff)
        with patch("monitor.analytics.build_opener") as mocked:
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "cpu", "range": "7d"},
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Unknown time range.")
        mocked.assert_not_called()

    def test_invalid_metric_and_arbitrary_promql_are_rejected(self):
        self.client.force_login(self.staff)
        with patch("monitor.analytics.build_opener") as mocked:
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "up", "range": "15m", "query": "up{job=\"outside\"}"},
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Unknown metric.")
        mocked.assert_not_called()
        self.assertNotIn(b"outside", response.content)
        self.assertNotIn(b"up{", response.content)

    def test_client_cannot_choose_the_prometheus_url(self):
        self.client.force_login(self.staff)
        opener = _opener(_matrix([]))
        with (
            patch("monitor.analytics.build_opener", return_value=opener),
            patch("monitor.analytics.time.time", return_value=FROZEN_TIME),
        ):
            response = self.client.get(
                "/api/analytics/history/",
                {
                    "metric": "cpu",
                    "range": "15m",
                    "url": "http://example.com/api/v1/query_range",
                },
            )
        self.assertEqual(response.status_code, 200)
        request = opener.open.call_args.args[0]
        self.assertTrue(request.full_url.startswith("http://127.0.0.1:9090/api/v1/query_range?"))
        self.assertNotIn("example.com", request.full_url)
        self.assertNotIn(b"example.com", response.content)
        self.assertNotIn(b"9090", response.content)
        handler = opener.open.call_args
        self.assertIsNotNone(handler)
        built = opener.open
        self.assertTrue(built.called)

    def test_configured_prometheus_url_must_stay_local(self):
        self.client.force_login(self.staff)
        cases = [
            "http://example.com:9090",
            "http://127.0.0.1:9091",
            "https://127.0.0.1:9090",
            "http://user:secret-token@127.0.0.1:9090",
            "http://127.0.0.1:9090/other",
        ]
        for configured in cases:
            with self.subTest(configured=configured):
                with (
                    override_settings(PROMETHEUS_BASE_URL=configured),
                    patch("monitor.analytics.build_opener") as mocked,
                ):
                    response = self.client.get(
                        "/api/analytics/history/",
                        {"metric": "cpu", "range": "15m"},
                    )
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.data["detail"], "Prometheus is not reachable.")
                mocked.assert_not_called()
                self.assertNotIn(b"example.com", response.content)
                self.assertNotIn(b"secret-token", response.content)

    def test_cpu_query_uses_the_stored_metric(self):
        self.client.force_login(self.staff)
        payload = _matrix(
            [
                {
                    "metric": {"__name__": "serverops_cpu_usage_percent"},
                    "values": [
                        [FROZEN_TIME - 30, "12.5"],
                        [FROZEN_TIME - 15, "NaN"],
                        [FROZEN_TIME, "+Inf"],
                    ],
                }
            ]
        )
        opener = _opener(payload)
        with (
            patch("monitor.analytics.build_opener", return_value=opener) as built,
            patch("monitor.analytics.time.time", return_value=FROZEN_TIME),
        ):
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "cpu", "range": "15m"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(built.call_args.args[0], _RejectRedirects)
        request = opener.open.call_args.args[0]
        self.assertIn("query=serverops_cpu_usage_percent", request.full_url)
        self.assertNotIn("query=up", request.full_url)
        self.assertEqual(request.get_method(), "GET")
        self.assertEqual(
            response.data["series"],
            [{"label": "cpu", "points": [{"timestamp": FROZEN_TIME - 30, "value": 12.5}]}],
        )
        self.assertNotIn(b"NaN", response.content)
        self.assertNotIn(b"serverops_cpu_usage_percent", response.content)

    def test_http_rate_query_keeps_route_series(self):
        self.client.force_login(self.staff)
        payload = _matrix(
            [
                {"metric": {"route": "metrics"}, "values": [[FROZEN_TIME, "0.1"]]},
                {"metric": {"route": "health"}, "values": [[FROZEN_TIME, "0.4"]]},
            ]
        )
        opener = _opener(payload)
        with (
            patch("monitor.analytics.build_opener", return_value=opener),
            patch("monitor.analytics.time.time", return_value=FROZEN_TIME),
        ):
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "http_requests", "range": "1h"},
            )
        request = opener.open.call_args.args[0]
        self.assertIn("rate%28serverops_http_requests_total%5B1m%5D%29", request.full_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["unit"], "requests_per_second")
        self.assertEqual(
            [item["label"] for item in response.data["series"]],
            ["health", "metrics"],
        )
        self.assertEqual(response.data["series"][0]["points"][0]["value"], 0.4)

    def test_empty_prometheus_results_stay_empty(self):
        self.client.force_login(self.staff)
        opener = _opener(_matrix([]))
        with patch("monitor.analytics.build_opener", return_value=opener):
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "disk", "range": "6h"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["series"], [])
        self.assertNotIn(b'"value"', response.content)

    def test_connection_failure_is_a_short_503(self):
        self.client.force_login(self.staff)
        opener = MagicMock()
        opener.open.side_effect = URLError("connection refused to secret-host")
        with patch("monitor.analytics.build_opener", return_value=opener):
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "memory", "range": "15m"},
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["detail"], "Prometheus is not reachable.")
        self.assertNotIn(b"secret-host", response.content)

    def test_timeout_is_a_short_503(self):
        self.client.force_login(self.staff)
        opener = MagicMock()
        opener.open.side_effect = TimeoutError("timed out talking to secret-host")
        with patch("monitor.analytics.build_opener", return_value=opener):
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "cpu", "range": "24h"},
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["detail"], "Prometheus did not respond in time.")
        self.assertNotIn(b"secret-host", response.content)

    def test_invalid_upstream_payloads_are_rejected(self):
        self.client.force_login(self.staff)
        payloads = [
            b"not-json",
            {"status": "error", "error": "bad query secret"},
            {"status": "success", "data": {"resultType": "vector", "result": []}},
            {"status": "success", "data": {"resultType": "matrix", "result": [{"values": "nope"}]}},
            {"status": "success"},
        ]
        for payload in payloads:
            with self.subTest(payload=payload if isinstance(payload, bytes) else payload.get("status")):
                opener = _opener(payload)
                with patch("monitor.analytics.build_opener", return_value=opener):
                    response = self.client.get(
                        "/api/analytics/history/",
                        {"metric": "cpu", "range": "15m"},
                    )
                self.assertEqual(response.status_code, 503)
                self.assertEqual(
                    response.data["detail"],
                    "Prometheus returned an unexpected response.",
                )
                self.assertNotIn(b"secret", response.content)
                self.assertNotIn(b"not-json", response.content)

    def test_upstream_http_error_hides_the_body(self):
        self.client.force_login(self.staff)
        opener = MagicMock()
        opener.open.side_effect = HTTPError(
            "http://127.0.0.1:9090/api/v1/query_range",
            500,
            "err",
            hdrs=None,
            fp=BytesIO(b"traceback secret-body"),
        )
        with patch("monitor.analytics.build_opener", return_value=opener):
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "disk", "range": "15m"},
            )
        self.assertEqual(response.status_code, 503)
        self.assertNotIn(b"secret-body", response.content)
        self.assertNotIn(b"9090", response.content)

    def test_post_is_not_allowed(self):
        self.client.force_login(self.staff)
        response = self.client.post("/api/analytics/history/", {"metric": "cpu"}, format="json")
        self.assertEqual(response.status_code, 405)

    def test_malformed_samples_are_dropped_or_rejected(self):
        self.client.force_login(self.staff)
        payload = _matrix(
            [
                {
                    "metric": {"route": "not a safe label"},
                    "values": [
                        [FROZEN_TIME, "101"],
                        [FROZEN_TIME + 15, "nope"],
                        [FROZEN_TIME + 30, True],
                    ],
                },
                {"metric": {"route": "health"}, "values": []},
            ]
        )
        opener = _opener(payload)
        with patch("monitor.analytics.build_opener", return_value=opener):
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "cpu", "range": "15m"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["series"], [])

        http_payload = _matrix(
            [{"metric": {"route": "bad label"}, "values": [[FROZEN_TIME, "0.2"]]}]
        )
        opener = _opener(http_payload)
        with patch("monitor.analytics.build_opener", return_value=opener):
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "http_requests", "range": "15m"},
            )
        self.assertEqual(response.data["series"][0]["label"], "requests")

    def test_upstream_shape_and_transport_failures(self):
        self.client.force_login(self.staff)
        cases = [
            _opener([]),
            _opener({"status": "success", "data": {"resultType": "matrix", "result": {"no": "list"}}}),
            _opener({"status": "success", "data": {"resultType": "matrix", "result": ["nope"]}}),
            _opener({"status": "success", "data": {"resultType": "matrix", "result": [{"metric": "cpu", "values": [[FROZEN_TIME, "1"]]}]}}),
            _opener({"status": "success", "data": {"resultType": "matrix", "result": [{"metric": {}, "values": [[FROZEN_TIME]]}]}}),
            _opener({"status": "success", "data": {"resultType": "matrix", "result": [{"metric": {}, "values": [[0, "1"]]}]}}),
            _opener(b"x" * 1_000_001),
        ]
        for opener in cases:
            with self.subTest(body=opener.open.return_value.read.return_value[:40]):
                with patch("monitor.analytics.build_opener", return_value=opener):
                    response = self.client.get(
                        "/api/analytics/history/",
                        {"metric": "memory", "range": "15m"},
                    )
                self.assertEqual(response.status_code, 503)

        bad_status = _opener(_matrix([]), status=500)
        with patch("monitor.analytics.build_opener", return_value=bad_status):
            response = self.client.get(
                "/api/analytics/history/",
                {"metric": "memory", "range": "15m"},
            )
        self.assertEqual(response.status_code, 503)

        for error in (URLError(TimeoutError()), OSError("secret-os")):
            opener = MagicMock()
            opener.open.side_effect = error
            with patch("monitor.analytics.build_opener", return_value=opener):
                response = self.client.get(
                    "/api/analytics/history/",
                    {"metric": "memory", "range": "15m"},
                )
            self.assertEqual(response.status_code, 503)
            self.assertNotIn(b"secret-os", response.content)

        self.assertIsNone(_RejectRedirects().redirect_request(None, None, 302, "moved", None, "http://evil"))
        with self.assertRaises(Exception):
            build_history("up", "15m")
