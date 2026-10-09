"""Session, CSRF, and administrator access checks."""

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from monitor.auth_views import INVALID_LOGIN, NOT_ALLOWED

TEST_PASSWORD = "test-only-not-a-real-account"


class AuthApiTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="staff-admin",
            password=TEST_PASSWORD,
            is_staff=True,
            is_active=True,
        )
        self.regular = User.objects.create_user(
            username="regular-user",
            password=TEST_PASSWORD,
            is_staff=False,
            is_active=True,
        )
        self.inactive = User.objects.create_user(
            username="inactive-admin",
            password=TEST_PASSWORD,
            is_staff=True,
            is_active=False,
        )

    def test_csrf_bootstrap_sets_a_cookie(self):
        client = APIClient(enforce_csrf_checks=True)
        response = client.get("/api/auth/csrf/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"detail": "CSRF cookie set."})
        self.assertIn("csrftoken", response.cookies)
        self.assertNotIn(b"SECRET", response.content)

    def test_admin_login_me_metrics_and_logout(self):
        client = self._csrf_client()
        login = self._login(client, "staff-admin", TEST_PASSWORD)

        self.assertEqual(login.status_code, 200)
        self.assertEqual(
            login.data,
            {"authenticated": True, "username": "staff-admin"},
        )
        self.assertNotIn(TEST_PASSWORD.encode(), login.content)

        me = client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["username"], "staff-admin")

        metrics = client.get("/api/metrics/cpu/")
        self.assertNotEqual(metrics.status_code, 401)
        self.assertNotEqual(metrics.status_code, 403)

        self._use_current_csrf(client)
        logged_out = client.post("/api/auth/logout/", {}, format="json")
        self.assertEqual(logged_out.status_code, 200)
        self.assertEqual(logged_out.data, {"success": True})

        self.assertEqual(client.get("/api/auth/me/").status_code, 401)
        self.assertEqual(client.get("/api/metrics/").status_code, 401)

    def test_invalid_password_and_unknown_user_look_the_same(self):
        client = self._csrf_client()
        bad_password = self._login(client, "staff-admin", "wrong-password")
        unknown = self._login(client, "missing-user", TEST_PASSWORD)

        self.assertEqual(bad_password.status_code, 401)
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(bad_password.data, {"detail": INVALID_LOGIN})
        self.assertEqual(unknown.data, bad_password.data)
        self.assertNotIn(b"wrong-password", bad_password.content)
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)

    def test_inactive_account_is_rejected_like_a_bad_login(self):
        client = self._csrf_client()
        response = self._login(client, "inactive-admin", TEST_PASSWORD)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data, {"detail": INVALID_LOGIN})
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)

    def test_non_admin_cannot_sign_in_or_read_metrics(self):
        client = self._csrf_client()
        response = self._login(client, "regular-user", TEST_PASSWORD)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data, {"detail": NOT_ALLOWED})
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)
        self.assertEqual(client.get("/api/metrics/").status_code, 401)
        self.assertEqual(client.get("/api/metrics/memory/").status_code, 401)

    def test_anonymous_session_check_and_metrics_are_rejected(self):
        client = APIClient()

        me = client.get("/api/auth/me/")
        metrics = client.get("/api/metrics/")
        health = client.get("/api/health/")

        self.assertEqual(me.status_code, 401)
        self.assertEqual(metrics.status_code, 401)
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.data, {"status": "ok", "service": "serverops-api"})
        self.assertNotIn("cpu", health.data)

    def test_login_without_csrf_does_not_start_a_session(self):
        client = APIClient(enforce_csrf_checks=True)
        self.assertEqual(client.get("/api/auth/csrf/").status_code, 200)

        response = client.post(
            "/api/auth/login/",
            {"username": "staff-admin", "password": TEST_PASSWORD},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data, {"detail": "CSRF validation failed."})
        self.assertNotIn(TEST_PASSWORD.encode(), response.content)
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)

    def test_logout_without_csrf_does_not_end_the_session(self):
        client = self._csrf_client()
        self.assertEqual(self._login(client, "staff-admin", TEST_PASSWORD).status_code, 200)
        client.credentials()

        rejected = client.post("/api/auth/logout/", {}, format="json")
        self.assertEqual(rejected.status_code, 403)
        self.assertEqual(rejected.data, {"detail": "CSRF validation failed."})
        self.assertNotIn(TEST_PASSWORD.encode(), rejected.content)
        self.assertEqual(client.get("/api/auth/me/").status_code, 200)

    def test_authenticated_non_admin_session_cannot_read_metrics(self):
        client = APIClient()
        client.force_login(self.regular)

        self.assertEqual(client.get("/api/auth/me/").status_code, 403)
        self.assertEqual(client.get("/api/metrics/disk/").status_code, 403)
        self.assertEqual(client.get("/api/health/").status_code, 200)

    def _csrf_client(self):
        client = APIClient(enforce_csrf_checks=True)
        response = client.get("/api/auth/csrf/")
        self.assertEqual(response.status_code, 200)
        self._use_current_csrf(client)
        return client

    def _use_current_csrf(self, client):
        client.credentials(HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)

    def _login(self, client, username, password):
        response = client.post(
            "/api/auth/login/",
            {"username": username, "password": password},
            format="json",
        )
        if "csrftoken" in client.cookies:
            self._use_current_csrf(client)
        return response
