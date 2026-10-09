"""API error responses that do not leak host details."""

from rest_framework.response import Response
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    """Return JSON errors. Hide tracebacks and local paths."""
    response = exception_handler(exc, context)
    if response is not None:
        return response
    return Response({"error": "Internal server error."}, status=500)
