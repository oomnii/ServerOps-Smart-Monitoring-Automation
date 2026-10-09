#!/usr/bin/env python
"""Django command-line utility for the ServerOps backend."""

import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Django is not installed in this interpreter. "
            "Use backend/.venv with Python 3.11."
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
