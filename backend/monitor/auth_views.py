"""Session login and logout for active staff users."""

from django.contrib.auth import authenticate, login, logout
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from monitor.authentication import CsrfEnforcedSessionAuthentication

INVALID_LOGIN = "Invalid username or password."
NOT_ALLOWED = "You do not have access to this application."


@ensure_csrf_cookie
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def csrf_cookie(request):
    return Response({"detail": "CSRF cookie set."})


@api_view(["POST"])
@authentication_classes([CsrfEnforcedSessionAuthentication])
@permission_classes([AllowAny])
def login_view(request):
    payload = request.data if isinstance(request.data, dict) else {}
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return Response({"detail": INVALID_LOGIN}, status=status.HTTP_401_UNAUTHORIZED)
    username = username.strip()
    if not username or not password:
        return Response({"detail": INVALID_LOGIN}, status=status.HTTP_401_UNAUTHORIZED)

    user = authenticate(request, username=username, password=password)
    if user is None or not user.is_active:
        return Response({"detail": INVALID_LOGIN}, status=status.HTTP_401_UNAUTHORIZED)
    if not user.is_staff:
        return Response({"detail": NOT_ALLOWED}, status=status.HTTP_403_FORBIDDEN)

    login(request, user)
    return Response(
        {"authenticated": True, "username": user.get_username()},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def me(request):
    user = request.user
    if not user.is_authenticated:
        return Response(
            {"detail": "Authentication required."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    if not user.is_active or not user.is_staff:
        return Response({"detail": NOT_ALLOWED}, status=status.HTTP_403_FORBIDDEN)
    return Response({"authenticated": True, "username": user.get_username()})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    logout(request)
    return Response({"success": True})
