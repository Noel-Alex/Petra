# Phage evidence data contract

## Purpose

This directory owns machine-readable published phage evidence used by Petra science packs. It does not own simulation state or infection dynamics.

## Authority

- `t4_mg1655_nabergoj_2018.json` is the canonical machine-readable copy of the measured Nabergoj et al. 2018 T4 DSM 4505 / *E. coli* K-12 MG1655 DSM 18039 life-history table.
- `t4_hu_2010_2012_transport.json` is the canonical machine-readable copy of the Hu et al. T4 transport anchors plus Petra's explicit transferred 0.5% host-free agarose calibration selection.
- Source rows are **measured** evidence and must preserve source units, context, uncertainty, DOI, host identity, phage identity, and measured growth-rate domain.
- Production simulation helpers must not duplicate or silently edit source rows in TypeScript; they import this canonical evidence object. Deterministic tests may pin published row literals as an independent regression guard.
- Interpolation is not stored as measurement data. It is a derived runtime projection owned by the pure resolver.
- Do not add a generic phage constant by averaging these rows.

## Scientific boundaries

- The measured adsorption constant is in `mL min^-1`; this file does not define Petra host/phage concentration units or an adsorption event hazard. That bridge is owned by #139.
- The source measures total latent period, not a separate eclipse-time table.
- T4 transport source rows remain **measured in their source apparatus/matrix**. Petra's selected 0.5% host-free agarose use is a separate **transferred** calibration and must not be relabeled measured-in-Petra.
- The 2.4e-12 m^2/s dead-K-12 agarose value includes adsorption effects in the apparent transport measurement; it is evidence/caution, not Petra's living-host diffusion coefficient.
- General free-phage loss remains unbound. Nabergoj's zero-loss model term must not be promoted to a universal measured spatial decay constant.
- The source context is homogeneous chemostat culture. Applying its host-growth relationship to local spatial Petra state is a transferred mechanistic approximation and must remain labelled as such.

## Verification

Every source row must resolve exactly through the simulator evidence resolver, including reported SDs. The measured domain must match the first/last rows, rows must be strictly increasing by host growth rate, and no resolver may silently extrapolate beyond the source domain.
