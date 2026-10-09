"""Allow only active staff users to read monitoring data."""

from rest_framework.permissions import BasePermission


class IsActiveStaff(BasePermission):
    message = "You do not have access to monitoring data."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.is_staff
        )
