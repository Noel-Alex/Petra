# Environmental response — temperature and pH

## Why this is a separate mechanism

Temperature and pH are not cosmetic “difficulty” sliders. Both change microbial growth in organism- and condition-dependent ways. Petra should not apply a universal Gaussian penalty around an arbitrary optimum.

## Temperature

### Suboptimal relation
Ratkowsky et al. (1982), DOI `10.1128/jb.149.1.1-5.1982`, established the widely used square-root relation over suboptimal temperatures:

```
sqrt(mu) = b * (T - T_min)
```

This is useful below the optimum but does not model the falling high-temperature branch.

### Full biokinetic range
Ratkowsky et al. (1983), DOI `10.1128/JB.154.3.1222-1226.1983`, extended the model across the entire growth-temperature range with explicit lower/upper bounds.

### E. coli-specific caution
Published *E. coli* growth data show that even resource-kinetic parameters can vary with temperature; conventional Monod may not fit every temperature equally well. Therefore a Petra “temperature” control is a coupled scenario parameter, not simply a multiplier pasted onto every other term.

## pH

Rosso, Lobry, Bajard & Flandrois (1995), DOI `10.1128/AEM.61.2.610-616.1995`, proposed a cardinal model using:
- `pH_min`;
- `pH_opt`;
- `pH_max`;

and combined it with cardinal temperature parameters under an independence hypothesis.

Their combined temperature/pH model was evaluated with an *E. coli* O157:H7 dataset and showed good correspondence between observed and calculated maximum specific growth rates.

This makes a cardinal-pH approach a scientifically defensible future Petra mechanism, but the **parameters remain strain/medium-specific**.

## Petra design

A scenario enabling temperature/pH must define:

```json
{
  "temperature": {
    "model": "cardinal_temperature",
    "tMin_C": "...",
    "tOpt_C": "...",
    "tMax_C": "...",
    "source": "...",
    "validatedRange": "..."
  },
  "pH": {
    "model": "cardinal_pH",
    "pHMin": "...",
    "pHOpt": "...",
    "pHMax": "...",
    "source": "...",
    "validatedRange": "..."
  }
}
```

The environment response can produce a factor on the scenario's maximum potential growth rate, but composition with antibiotic stress must be separately specified; Petra should not imply that a source validated all stressors together unless it did.

## Product behavior

When a user drags temperature or pH:
- display the active cardinal curve;
- show the source-supported range;
- warn on extrapolation;
- if beyond the growth domain, distinguish “growth model says no growth” from a separately validated death/inactivation model.

## Flagship decision

Keep `E. coli + ciprofloxacin` at its reference temperature for the first authoritative build. Add temperature/pH only after a compatible *E. coli* parameter set is curated rather than weakening an otherwise strong flagship scenario.
