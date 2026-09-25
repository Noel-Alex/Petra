#!/usr/bin/env python3
"""Deterministic checks for Petra's local subprocess command resolver."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from local_command import resolve_local_command


class ResolveLocalCommandTests(unittest.TestCase):
    def test_non_windows_preserves_declared_argv(self) -> None:
        declared = ["npm", "run", "build"]
        with (
            patch("local_command._uses_windows_command_shims", return_value=False),
            patch("local_command.shutil.which") as which,
        ):
            resolved = resolve_local_command(declared)

        self.assertEqual(resolved, declared)
        self.assertIsNot(resolved, declared)
        which.assert_not_called()

    def test_windows_pins_python_to_active_interpreter_before_path_lookup(self) -> None:
        declared = ["python", "tools/worker_transport_profile.py"]
        active_python = r"C:\\Python312\\python.exe"
        windows_store_alias = r"C:\\Users\\petra\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe"
        with (
            patch("local_command._uses_windows_command_shims", return_value=True),
            patch("local_command.sys.executable", active_python),
            patch("local_command.shutil.which", return_value=windows_store_alias) as which,
        ):
            resolved = resolve_local_command(declared)

        self.assertEqual(resolved, [active_python, *declared[1:]])
        self.assertEqual(declared[0], "python")
        which.assert_not_called()

    def test_windows_resolves_path_shim_without_changing_arguments(self) -> None:
        declared = ["npm", "exec", "--offline", "--", "vitest", "run"]
        env = {"PATH": r"C:\Program Files\nodejs"}
        npm_cmd = r"C:\Program Files\nodejs\npm.CMD"
        with (
            patch("local_command._uses_windows_command_shims", return_value=True),
            patch("local_command.shutil.which", return_value=npm_cmd) as which,
        ):
            resolved = resolve_local_command(declared, env=env)

        self.assertEqual(resolved, [npm_cmd, *declared[1:]])
        self.assertEqual(declared[0], "npm")
        which.assert_called_once_with("npm", path=env["PATH"])

    def test_missing_windows_command_keeps_original_for_normal_failure(self) -> None:
        declared = ["missing-petra-command", "--version"]
        with (
            patch("local_command._uses_windows_command_shims", return_value=True),
            patch("local_command.shutil.which", return_value=None),
        ):
            resolved = resolve_local_command(declared)

        self.assertEqual(resolved, declared)

    def test_invalid_argv_is_rejected_before_lookup(self) -> None:
        with self.assertRaises(ValueError):
            resolve_local_command([])


if __name__ == "__main__":
    unittest.main()
