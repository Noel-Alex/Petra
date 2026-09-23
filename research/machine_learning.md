# Machine Learning Strategy

## Recommendation

Do not use an LLM or neural network to decide biological events in the first release. The mechanistic model is the scientific contribution.

If ML is added, use it as a **surrogate/emulator** trained on the validated simulator.

## Why this is legitimate

Mechanistic biological simulators can be expensive when exploring many parameter combinations. ML emulators can approximate their outputs at much lower computational cost while preserving the mechanistic simulator as ground truth.

Sources:

- Bridging the gap between mechanistic biological models and machine learning surrogates (2023), DOI `10.1371/journal.pcbi.1010988`.
- Using Emulation to Engineer and Understand Simulations of Biological Systems (2020), DOI `10.1109/TCBB.2018.2843339`.
- Surrogate modeling of Cellular-Potts agent-based models as a segmentation task using U-Net (2025), DOI `10.1371/journal.pcbi.1013626`.

## Lowest-risk ML: trajectory emulator

Inputs:

- starting nutrient;
- temperature;
- drug schedule/geometry summary;
- initial population;
- mutation/fitness parameters;
- current aggregate state.

Outputs:

- total population trajectory;
- resistant fraction;
- nutrient remaining;
- lineage diversity.

Candidate: small MLP or gradient-boosted model.

## Ambitious ML: spatial emulator

Input channels:

- nutrient;
- drug;
- WT density;
- resistant-lineage density channels.

Output: same channels `K` mechanistic steps ahead.

Candidate: compact U-Net/ConvLSTM.

## Scientific safeguards

- train only within a declared mechanistic parameter domain;
- validate on unseen parameter combinations;
- show error metrics;
- badge output as **Emulated**;
- preserve a one-click mechanistic spot-check;
- reject/out-of-domain warn rather than hallucinate.

## Bad uses

- LLM chooses the next mutation;
- model invents MIC or mutation rates;
- generative image is presented as colony simulation;
- adding “AI” purely for judging optics.

A strong judging answer is: **we kept causality mechanistic and use AI only where it can be quantitatively validated as an accelerator.**
