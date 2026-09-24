# Phage life history and host physiological state

Phage parameters are not constants independent of the bacterial host's condition.

## Evidence
- Nabergoj, Modic & Podgornik 2018, DOI `10.1002/mbo3.558`: T4 DSM 4505 on *E. coli* K-12 MG1655 DSM 18039 in low-salt LB at 37 °C. Across host growth rates `0.06–0.98 h^-1`, latent period fell from about 80 to 27 min and burst size rose from about 8 to 89 PFU/cell; adsorption also varied substantially.
- Hadas et al. 1997, DOI `10.1099/00221287-143-1-179`: T4 adsorption/development changed with *E. coli* B/r growth rate. This corroborates the mechanism but is not the numeric MG1655 preset.
- You, Suthers & Yin 2002, DOI `10.1128/JB.184.7.1888-1894.2002`: T7 on *E. coli* BL21 showed decreasing eclipse time and increasing production rate with host growth. This is comparative mechanism evidence only.
- Classic lytic population models use adsorption, latent period/delay, burst size, free-phage loss, and host growth.

## Petra rule
The first Science Mode phage scenario uses the named T4 DSM 4505 / MG1655 DSM 18039 pack described in `phage_t4_mg1655_pack.md`. Host resource/growth state modulates adsorption, latency and burst over the measured domain rather than using one fixed phage constant. Mapping homogeneous chemostat growth-rate data to a local spatial growth rate remains an explicit transfer approximation.

A generic phage sandbox can exist, but its parameters must be labeled experimental/user-defined.
