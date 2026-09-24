"""Resolve local subprocess argv without invoking a shell.

Windows package-manager launchers such as npm are commonly installed as .cmd
shims. Python's shell-free subprocess path may not resolve the bare shim name
the same way an interactive shell does, so local experiment tooling resolves
argv[0] through PATH before spawning it.
"""

from __future__ import annotations

import shutil
from collections.abc import Sequence


def resolve_local_command(argv: Sequence[str]) -> list[str]:
    """Return argv with a PATH-resolved executable when one is available.

    Keeping the remaining arguments untouched preserves shell-free execution
    and avoids quoting/interpolation changes. If PATH cannot resolve argv[0],
    return the original command so subprocess raises its normal launch error.
    """
    if not argv:
        raise ValueError("local command argv must be non-empty")
    command = list(argv)
    resolved = shutil.which(command[0])
    if resolved is not None:
        command[0] = resolved
    return command
