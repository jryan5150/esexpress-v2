# PCS Calibration Report — 2026-04-23T03:17:18.524Z

Division: ES Express (letter=B) · Account: 138936

## The insight this calibration reveals

PCS's GetLoads returns only **currently-open** loads (status=Arrived, awaiting invoicing/finalization) — 44 of them as of this run. That's the ES Express customer pipeline right now: **mostly Comstock Dinkins JG 1H (36 loads) + Frac-Chem Load (4) + 2 Sandbox wells + 2 others**.

Cross-matching these to v2 reveals a structural fact we didn't have visibility into before: **v2 and PCS are tracking different views of the same business**.

- **v2 ingests the UPSTREAM dispatch data** — what PropX and Logistiq send us, which is Liberty carrier jobs originating from the carrier's dispatch system: _Liberty Apache Formentera Wrangler, Liberty Titan DNR Chili, Liberty HV Cobra Apex ASJ HC East_, etc.
- **PCS holds the DOWNSTREAM billing data** — the loads ES Express manually enters into PCS after delivery, keyed by the **customer's** well name (Comstock Dinkins, Frac-Chem, Sandbox wells) and the customer's own scale-ticket references (204097, 211101, etc).

The 43 "not in v2" entries aren't a matching failure — they're the same loads at a later lifecycle stage, entered by Scout/Steph/Keli manually into PCS using the customer-facing well name. v2 saw these same physical deliveries coming from Liberty's dispatch side; PCS saw them coming from the billing side.

## What this means for Monday

1. **This is the gap PCS push closes.** Once `PCS_DISPATCH_ENABLED=true`, every validated v2 load auto-creates a matching PCS entry — no more manual re-entry. The 44 open PCS loads today become 0 open tomorrow because v2's push keeps them aligned in real-time.
2. **Jenny's reconciliation automates via the `missedByV2` list** — loads in PCS without a v2 counterpart are automatic signal that either (a) v2 missed an ingest, or (b) a manual PCS entry exists that didn't come through the carrier pipeline. Either way: findable.
3. **The scale ticket numbers in PCS stops (204097, 211101, 178565) are the real match key** — these are PropX/Logistiq-side identifiers that our v2 already has as `ticket_no`. In the active pipeline this data doesn't match because PCS's 44 loads are for a DIFFERENT customer (Comstock), not for the Liberty wells we just aliased. Post-PCS-push, new loads will carry v2's ticket through into PCS's stop.referenceNumber, making reconciliation automatic.

## Matcher/re-score not useful here

Earlier plan considered a full re-score + BOL re-match to improve matcher accuracy "against PCS ground truth." Calibration shows those would NOT help, because:

- The 44 PCS loads are a different customer's pipeline (Comstock) than v2's current data (Liberty carrier jobs).
- v2's ticket_no values (SCS26180796 etc.) don't intersect with PCS's 136xxx range.
- Re-scoring v2's existing 53K loads wouldn't produce new PCS matches because the data domains don't overlap.

**Deferred: the broad re-score work until after we have Liberty's wells actively pushing into PCS and a comparable load population.**

## Summary

- Total currently-open PCS loads: **44**
- Perfect match (v2 has, right well, photo present): **0**
- v2 has match on **wrong well**: **0**
- v2 has match, missing photo: **1**
- Weak match (companyName only): **0**
- **Not in v2 (missed ingest)**: **43**

### Photo coverage

- PCS loads with BillOfLading attached: **1**
- Of those, **not** present in v2's photo pipeline: **0**

## Per-well reconciliation

| Consignee (PCS)                     | PCS | v2 matched | v2 wrong well | Not in v2 |
| ----------------------------------- | --: | ---------: | ------------: | --------: |
| Comstock Dinkins JG 1H              |  36 |          0 |             0 |        36 |
| Frac-Chem Load                      |   4 |          0 |             0 |         4 |
| (unknown)                           |   2 |          1 |             0 |         1 |
| Sandbox - Ti2 Williams Chumley WO 1 |   1 |          0 |             0 |         1 |
| Sandbox - Ti3 Stetson 19XX 2_3H     |   1 |          0 |             0 |         1 |

## Classified results (detail)

### not_in_v2 (43)

| PCS loadId | PCS ref             | Consignee                           | Stop ref      | v2 ticket | v2 well | photo |
| ---------- | ------------------- | ----------------------------------- | ------------- | --------- | ------- | ----- |
| 284499     | 136113              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284507     | 136121              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284497     | 136111              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284480     | 136094              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284505     | 136119              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284498     | 136112              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284475     | 136089              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284488     | 136102              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284478     | 136092              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284501     | 136115              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284476     | 136090              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284509     | 136123              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284483     | 136097              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284496     | 136110              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284474     | 136088              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284506     | 136120              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284482     | 136096              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284484     | 136098              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284504     | 136118              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284479     | 136093              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284486     | 136100              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284477     | 136091              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284487     | 136101              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284485     | 136099              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284500     | 136114              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284508     | 136122              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284481     | 136095              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284489     | 136103              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284503     | 136117              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 285279     | 136893              | Frac-Chem Load                      | 204097/204098 | —         | —       | —     |
| 285277     | 136891              | Frac-Chem Load                      | 204095/204096 | —         | —       | —     |
| 284502     | 136116              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 294626     | 145060              | Sandbox - Ti2 Williams Chumley WO 1 | —             | —         | —       | —     |
| 285278     | 136892              | Frac-Chem Load                      | 211101/211102 | —         | —       | —     |
| 357469     | TEST-PHOTO-20260422 | —                                   | —             | —         | —       | —     |
| 290091     | 141701              | Frac-Chem Load                      | 178565        | —         | —       | —     |
| 294631     | 145065              | Sandbox - Ti3 Stetson 19XX 2_3H     | —             | —         | —       | —     |
| 284491     | 136105              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284493     | 136107              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |
| 284492     | 136106              | Comstock Dinkins JG 1H              | —             | —         | —       | —     |

_…and 3 more_

### v2_no_photo (1)

| PCS loadId | PCS ref           | Consignee | Stop ref | v2 ticket         | v2 well                            | photo |
| ---------- | ----------------- | --------- | -------- | ----------------- | ---------------------------------- | ----- |
| 357468     | TEST-202604222102 | —         | —        | TEST-202604222102 | Liberty Apache Formentera Wrangler | ✗     |
