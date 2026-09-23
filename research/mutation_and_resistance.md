# Mutation, Selection, Resistance and Fitness

## Luria–Delbrück principle

The central educational point is that selection can amplify variants that arose spontaneously before exposure.

Classic source:

- Luria & Delbrück (1943), *Genetics*, DOI `10.1093/genetics/28.6.491`.

PETRA therefore samples mutants from **new divisions**, never from “the antibiotic caused a mutation.”

## Event model

For a transition probability `p` and `n_births` births:

- use `Binomial(n_births, p)` when practical;
- use a Poisson approximation for rare events and large birth counts.

Mutant newborns are removed from the parent's newborn count and added to the child lineage.

## Flagship curated genotype graph

Do not use an arbitrary continuous “resistance stat.” Use named states from a curated *E. coli* ciprofloxacin scenario.

Useful nodes include:

- WT;
- `gyrA S83L`;
- `gyrA S83L + parC S80I`;
- optional branches involving `gyrA D87N`, `marR`, `acrR` changes.

Phenotypic MIC/fitness anchors are taken from Marcusson et al. (2009), DOI `10.1371/journal.ppat.1000541`.

## Mutation supply

Huseby et al. (2017), DOI `10.1093/molbev/msx052`, shows why a single universal “mutation rate to resistance” is misleading: effective selected rates depend on the mutational target and starting genotype.

Rule:

**transition edges need their own interpretation and provenance.** A high aggregate rate for any mutation in a large regulatory target must not be assigned to one specific nucleotide change.

## Fitness costs

Resistance-associated fitness is genotype and environment dependent. It is not always a cost, and it is not monotonic with mutation count.

General source:

- Andersson & Hughes (2010), DOI `10.1038/nrmicro2319`.

Compensatory evolution source:

- Schulz zur Wiesch et al. (2010), DOI `10.1128/AAC.01460-09`.

## Demonstrations PETRA should produce

1. **No drug:** a costly resistant lineage may lose to WT.
2. **Spatial drug gradient:** a rare resistant lineage may expand where WT cannot.
3. **Different seeds:** mutation emergence timing differs across replicate runs.
4. **Same seed + same actions:** exact trajectory replay.
5. **Spatial trapping:** resistance alone does not guarantee a lineage wins the advancing front.
