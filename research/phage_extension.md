# Phage Extension

A named lytic phage-host pair is a scientifically strong stretch feature, but generic “virus mode” is not acceptable in Science Mode.

## Mechanistic variables

A standard population model uses:

- susceptible bacteria `B`;
- infected bacteria `I` or staged infected compartments;
- free phage `P`;
- adsorption rate constant;
- latent period;
- burst size;
- free-phage decay;
- host growth/resource dependence.

Adsorption is typically proportional to `B * P`.

## Browser-friendly latent period

Instead of a delay differential equation, approximate the latent period with `n` infected transit compartments:

`I1 -> I2 -> ... -> In -> lysis`

The final transition kills the infected host and releases approximately `burst_size` phage. An Erlang/transit-chain approximation is numerically convenient and avoids a full history buffer.

## Spatial extension

Each tile may hold free-phage concentration/density. Phage diffuses with an effective coefficient, adsorbs locally and generates infected host cohorts.

## Evidence

Useful sources:

- Population Dynamics of a Salmonella Lytic Phage and Its Host (2014), PMCID `PMC4106826`.
- Nabergoj, Modic & Podgornik (2018), T4 DSM 4505 / MG1655 DSM 18039 life-history calibration, DOI `10.1002/mbo3.558`, PMCID `PMC5911998`.
- Computational Modelling of Large Scale Phage Production Using a Two-Stage Batch Process (2018), PMCID `PMC6026895`.
- Quantifying the Significance of Phage Attack on Starter Cultures (2006), DOI `10.1128/AEM.02429-05`.

## Selected Science-Mode pair

The research gate now selects **bacteriophage T4 DSM 4505 / *E. coli* K-12 MG1655 DSM 18039** for the first pack. Nabergoj, Modic & Podgornik 2018 (DOI `10.1002/mbo3.558`) measured growth-rate-dependent adsorption, latent period and burst size for this exact pair in low-salt LB at 37 °C.

See `phage_t4_mg1655_pack.md` for the measured table, transfer boundary, OOD rule, and implementation handoff.

## Scientific rule

Phage parameters vary with host, environment and host physiological state. The selected MG1655/T4 life-history table may be implemented with explicit transfer provenance, but spatial diffusion, eclipse-time subdivision and a general free-phage decay constant remain separately unbound. Do not fill those gaps with generic phage defaults.

## Priority

Phage is **after** the core nutrient + ciprofloxacin + mutation system. It adds another field and delayed process and is not required for a competition-quality MVP.
