"""Session authentication that returns HTTP 401 for anonymous API calls."""

from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied


class SessionAuthentication401(SessionAuthentication):
    def authenticate_header(self, request):
        return "Session"

    def enforce_csrf(self, request):
        try:
            super().enforce_csrf(request)
        except PermissionDenied as exc:
            raise PermissionDenied("CSRF validation failed.") from exc


class CsrfEnforcedSessionAuthentication(SessionAuthentication401):
    """Reject a missing CSRF token before an anonymous login is accepted."""

    def authenticate(self, request):
        self.enforce_csrf(request)
        return super().authenticate(request)
