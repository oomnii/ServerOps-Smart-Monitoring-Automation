"""Metric and health routes."""

from django.urls import path

from monitor import analytics, auth_views, views

urlpatterns = [
    path("auth/csrf/", auth_views.csrf_cookie, name="auth-csrf"),
    path("auth/login/", auth_views.login_view, name="auth-login"),
    path("auth/logout/", auth_views.logout_view, name="auth-logout"),
    path("auth/me/", auth_views.me, name="auth-me"),
    path("health/", views.health, name="health"),
    path("metrics/cpu/", views.cpu_metrics, name="cpu-metrics"),
    path("metrics/memory/", views.memory_metrics, name="memory-metrics"),
    path("metrics/disk/", views.disk_metrics, name="disk-metrics"),
    path("metrics/", views.all_metrics, name="all-metrics"),
    path("analytics/history/", analytics.history, name="analytics-history"),
]
