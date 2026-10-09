FROM python:3.12-slim-bookworm

COPY requirements.txt /tmp/requirements.txt
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt \
    && sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod 755 /usr/local/bin/docker-entrypoint.sh \
    && useradd --create-home --uid 1000 --user-group --shell /usr/sbin/nologin serverops \
    && mkdir -p /tmp/.ansible/tmp /tmp/.ansible/remote /opt/serverops-ansible \
    && chown -R serverops:serverops /tmp/.ansible /opt/serverops-ansible

USER serverops
WORKDIR /opt/serverops-ansible
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["sleep", "infinity"]
