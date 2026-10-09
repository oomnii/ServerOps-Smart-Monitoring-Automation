"""Bearer-token protected Prometheus exposition endpoint."""

from django.http import HttpResponse

from monitor.exporter import register_collectors, render_metrics, scrape_is_authorized

register_collectors()


def prometheus_metrics(request):
    if request.method != "GET":
        return HttpResponse(status=405)
    if not scrape_is_authorized(request.headers.get("Authorization", "")):
        return HttpResponse("Unauthorized.\n", status=401, content_type="text/plain")
    rendered = render_metrics()
    if rendered is None:
        return HttpResponse(
            "Unable to collect system metrics.\n",
            status=503,
            content_type="text/plain",
        )
    payload, content_type = rendered
    return HttpResponse(payload, content_type=content_type)
