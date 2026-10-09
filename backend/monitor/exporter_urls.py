"""Prometheus scrape route. This is not part of the dashboard API."""

from django.urls import path

from monitor.exporter_views import prometheus_metrics

urlpatterns = [
    path("", prometheus_metrics, name="prometheus-metrics"),
]
