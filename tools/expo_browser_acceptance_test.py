#!/usr/bin/env python3
"""Deterministic checks for Petra browser-acceptance publication helpers."""

from __future__ import annotations

import unittest
from typing import Any

from expo_browser_acceptance import authoritative_load_for_command


def publication_sample(
    phase: str,
    *,
    trace_hash: str = "trace-1",
    command_count: int = 3,
    total_biomass: float = 42.5,
    occupied_cells: int = 7,
) -> dict[str, Any]:
    return {
        "version": 2,
        "phase": phase,
        "runBranchIdentity": "branch-1",
        "traceHash": trace_hash,
        "tick": command_count + 1,
        "commandCount": command_count,
        "simulationTimeHours": float(command_count),
        "authoritativeTotalBiomass": total_biomass,
        "authoritativeOccupiedCells": occupied_cells,
    }


class AuthoritativeLoadCorrelationTests(unittest.TestCase):
    def test_resolves_exact_source_load_from_complete_transaction(self) -> None:
        samples = [
            publication_sample("runtime-snapshot-published"),
            publication_sample("dish-projection"),
            publication_sample("react-dish-committed"),
        ]

        load = authoritative_load_for_command(samples, 3)

        self.assertEqual(
            load,
            {
                "runBranchIdentity": "branch-1",
                "traceHash": "trace-1",
                "tick": 4,
                "commandCount": 3,
                "simulationTimeHours": 3.0,
                "totalBiomass": 42.5,
                "occupiedCells": 7,
                "biomassUnit": "model-biomass",
                "occupiedCellMeaning": "authoritative occupied grid cells",
            },
        )

    def test_accepts_repeated_same_transaction_samples_when_load_agrees(self) -> None:
        samples = [
            publication_sample("runtime-snapshot-published"),
            publication_sample("runtime-snapshot-published"),
            publication_sample("dish-projection"),
            publication_sample("react-dish-committed"),
            publication_sample("react-dish-committed"),
        ]

        load = authoritative_load_for_command(samples, 3)

        self.assertIsNotNone(load)
        self.assertEqual(load["totalBiomass"], 42.5)
        self.assertEqual(load["occupiedCells"], 7)

    def test_refuses_cross_phase_load_disagreement(self) -> None:
        samples = [
            publication_sample("runtime-snapshot-published"),
            publication_sample("dish-projection", total_biomass=43.0),
            publication_sample("react-dish-committed"),
        ]

        self.assertIsNone(authoritative_load_for_command(samples, 3))

    def test_refuses_incomplete_transaction(self) -> None:
        samples = [
            publication_sample("runtime-snapshot-published"),
            publication_sample("dish-projection"),
        ]

        self.assertIsNone(authoritative_load_for_command(samples, 3))

    def test_uses_last_complete_matching_identity_without_mixing_transactions(self) -> None:
        samples = [
            publication_sample("runtime-snapshot-published", trace_hash="trace-old"),
            publication_sample("dish-projection", trace_hash="trace-old"),
            publication_sample("react-dish-committed", trace_hash="trace-old"),
            publication_sample(
                "runtime-snapshot-published",
                trace_hash="trace-new",
                total_biomass=50.0,
                occupied_cells=9,
            ),
            publication_sample(
                "dish-projection",
                trace_hash="trace-new",
                total_biomass=50.0,
                occupied_cells=9,
            ),
            publication_sample(
                "react-dish-committed",
                trace_hash="trace-new",
                total_biomass=50.0,
                occupied_cells=9,
            ),
        ]

        load = authoritative_load_for_command(samples, 3)

        self.assertIsNotNone(load)
        self.assertEqual(load["traceHash"], "trace-new")
        self.assertEqual(load["totalBiomass"], 50.0)
        self.assertEqual(load["occupiedCells"], 9)


if __name__ == "__main__":
    unittest.main()
