# Phage evidence data contract

## Purpose

This directory owns machine-readable published phage evidence used by Petra science packs. It does not own simulation state or infection dynamics.

## Authority

- `t4_mg1655_nabergoj_2018.json` is the canonical machine-readable copy of the measured Nabergoj et al. 2018 T4 DSM 4505 / *E. coli* K-12 MG1655 DSM 18039 life-history table.
- Source rows are **measured** evidence and must preserve source units, context, uncertainty, DOI, host identity, phage identity, and measured growth-rate domain.
- Production simulation helpers must not duplicate or silently edit source rows in TypeScript; they import this canonical evidence object. Deterministic tests may pin published row literals as an independent regression guard.
- Interpolation is not stored as measurement data. It is a derived runtime projection owned by the pure resolver.
- Do not add a generic phage constant by averaging these rows.

## Scientific boundaries

- The measured adsorption constant is in `mL min^-1`; this file does not define Petra host/phage concentration units or an adsorption event hazard. That bridge is owned by #139.
- The source measures total latent period, not a separate eclipse-time table.
- Physical T4 diffusion and general free-phage loss are not bound here; #140 owns matrix-specific transport/loss calibration.
- The source context is homogeneous chemostat culture. Applying its host-growth relationship to local spatial Petra state is a transferred mechanistic approximation and must remain labelled as such.

## Verification

Every source row must resolve exactly through the simulator evidence resolver, including reported SDs. The measured domain must match the first/last rows, rows must be strictly increasing by host growth rate, and no resolver may silently extrapolate beyond the source domain.
