"""Read-only HTTP endpoints for host metrics."""

from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from monitor.permissions import IsActiveStaff

from monitor.services import (
    MetricsCollectionError,
    get_all_metrics,
    get_cpu_metrics,
    get_disk_metrics,
    get_memory_metrics,
)


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    """Confirm that this API process is responding."""
    return Response({"status": "ok", "service": "serverops-api"})


@api_view(["GET"])
@permission_classes([IsActiveStaff])
def cpu_metrics(request):
    return _metrics(get_cpu_metrics)


@api_view(["GET"])
@permission_classes([IsActiveStaff])
def memory_metrics(request):
    return _metrics(get_memory_metrics)


@api_view(["GET"])
@permission_classes([IsActiveStaff])
def disk_metrics(request):
    return _metrics(get_disk_metrics)


@api_view(["GET"])
@permission_classes([IsActiveStaff])
def all_metrics(request):
    return _metrics(get_all_metrics)


def _metrics(collector):
    try:
        return Response(collector())
    except MetricsCollectionError as exc:
        return Response(
            {"detail": str(exc)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
