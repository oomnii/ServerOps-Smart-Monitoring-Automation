#!/bin/sh
set -eu
cp /opt/serverops-ansible/ansible.cfg /home/serverops/ansible.cfg
chmod 644 /home/serverops/ansible.cfg
exec "$@"
