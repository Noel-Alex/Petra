"""Resolve local subprocess argv without invoking a shell.

Windows developer tools such as npm are commonly exposed through PATHEXT
command shims (for example npm.cmd). Python's subprocess launcher does not
perform the same PATH/PATHEXT lookup for a bare argv[0], so local Petra tools
resolve the executable before process creation while preserving the remaining
argv exactly.
"""

from __future__ import annotations

import os
import shutil
from collections.abc import Mapping, Sequence


def _uses_windows_command_shims() -> bool:
    return os.name == "nt"


def resolve_local_command(
    argv: Sequence[str],
    *,
    env: Mapping[str, str] | None = None,
) -> list[str]:
    """Return launch argv with a Windows PATH/PATHEXT executable resolved.

    Non-Windows argv is copied unchanged. On Windows, a resolvable argv[0] is
    replaced with the concrete path returned by shutil.which(). If lookup fails,
    argv is left unchanged so subprocess preserves its normal missing-command
    failure instead of turning absence into a misleading fallback.
    """

    if isinstance(argv, (str, bytes)) or not argv:
        raise ValueError("local command argv must be a non-empty string sequence")
    if not all(isinstance(part, str) for part in argv):
        raise TypeError("local command argv entries must be strings")
    if not argv[0].strip():
        raise ValueError("local command argv[0] must be non-empty")

    resolved = list(argv)
    if not _uses_windows_command_shims():
        return resolved

    search_path = env.get("PATH") if env is not None else None
    executable = shutil.which(resolved[0], path=search_path)
    if executable is not None:
        resolved[0] = executable
    return resolved
