"""JSON response for a failed CSRF check."""

from django.http import JsonResponse


def csrf_failure(request, reason=""):
    return JsonResponse({"detail": "CSRF validation failed."}, status=403)
