from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("mops_glucose_resource_calibration.py")
SPEC = importlib.util.spec_from_file_location(
    "mops_glucose_resource_calibration",
    MODULE_PATH,
)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class MopsGlucoseSourceSchemaProbeTests(unittest.TestCase):
    def test_static_probe_reports_references_and_vector_shapes_without_values(self) -> None:
        raw = b"""
        glucose = [0.17 0.5 1.0 11];
        response = [0.1, 0.2, 0.3, 0.4];
        load('../data/glucose_37c.mat');
        auxiliary = readtable("replicates.tsv");
        """

        schema = MODULE.matlab_schema_probe(raw)

        self.assertEqual(
            schema["source_references"],
            ["../data/glucose_37c.mat", "replicates.tsv"],
        )
        self.assertEqual(
            schema["numeric_vector_assignments"],
            [
                {"identifier": "glucose", "numeric_value_count": 4},
                {"identifier": "response", "numeric_value_count": 4},
            ],
        )
        self.assertNotIn("0.17", str(schema))

    def test_reference_resolution_prefers_exact_relative_path(self) -> None:
        files = [
            {
                "id": 7,
                "filename": "glucose_37c.mat",
                "directory": "MonodLaw_Data/analysis_37C/data",
                "path": "MonodLaw_Data/analysis_37C/data/glucose_37c.mat",
                "size_bytes": 12,
                "content_type": "application/matlab-mat",
                "checksum_type": "MD5",
                "checksum": "abc",
            }
        ]

        resolved = MODULE.resolve_source_reference(
            files,
            script_path="MonodLaw_Data/analysis_37C/analysis/monod_fit_glucose.m",
            reference="../data/glucose_37c.mat",
        )

        self.assertEqual(resolved["status"], "resolved-exact-path")
        self.assertEqual(resolved["id"], 7)

    def test_ambiguous_basename_never_guesses(self) -> None:
        files = [
            {
                "id": 1,
                "filename": "growth.mat",
                "directory": "a",
                "path": "a/growth.mat",
                "size_bytes": 1,
                "content_type": "application/matlab-mat",
                "checksum_type": "MD5",
                "checksum": "a",
            },
            {
                "id": 2,
                "filename": "growth.mat",
                "directory": "b",
                "path": "b/growth.mat",
                "size_bytes": 1,
                "content_type": "application/matlab-mat",
                "checksum_type": "MD5",
                "checksum": "b",
            },
        ]

        resolved = MODULE.resolve_source_reference(
            files,
            script_path="c/probe.m",
            reference="growth.mat",
        )

        self.assertEqual(resolved["status"], "ambiguous-basename")
        self.assertEqual(resolved["candidate_count"], 2)


if __name__ == "__main__":
    unittest.main()
