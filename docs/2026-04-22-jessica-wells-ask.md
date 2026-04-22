# Email to Jessica — Wells corroboration ask

**To:** Jess@ESExpressllc.com
**CC:** Bryan.Janz@Lexcom.com
**Subject:** ES Express — 9 destinations need your eye before we finish the backfill

---

Jessica,

During tonight's diagnostic pass I pulled every PropX and Logistiq destination that never matched a well in our master. Most of them — about 20,000 loads — point to wells that already exist in the system; we'll clean those up automatically during the maintenance window with no input needed. But 9 destinations don't match anything, and those need your call before I can close the loop.

Here's the list, ordered by how many loads each one represents:

| Destination (what PropX / Logistiq writes)       | Source   | Orphan loads | Closest existing well (best guess) | Match % |
| :----------------------------------------------- | :------- | -----------: | :--------------------------------- | :------ |
| Wells 1/2/3                                      | PropX    |          787 | (none strong)                      | 19%     |
| Bledsoe                                          | PropX    |          338 | (none)                             | 6%      |
| DNR - Chili 117X                                 | PropX    |          213 | (none)                             | 10%     |
| ASJ 4&16-11-11 HC East                           | PropX    |          123 | Nabors 6&7-11-11 HC (probably not) | 20%     |
| Comstock Dixon 6HU 1-Alt/2-Alt/Dixon 6-1HU 1-Alt | Logistiq |           72 | HV (SPITFIRE) Comstock - Nation    | 21%     |
| G07A IRELAND WILLIAMS 1HH 2HH 3HH                | PropX    |           19 | (none)                             | 12%     |
| Apache-Formentera-Wrangler                       | PropX    |            8 | (none — see note below)            | 24%     |
| Spectre-Crescent-SIMUL Briscoe Cochina           | PropX    |            2 | Spectre-Crescent-SIMUL Washburn    | 48%     |
| Civitas - First Tee                              | PropX    |            2 | Civitas - Backdoor Slider E2       | 22%     |

For each row, one of three answers:

1. **Alias to existing well X** — same well, different name. I add the destination string as an alias and the auto-mapper handles the rest.
2. **Add as new well** — real well we haven't set up yet. Give me the canonical name you want to use and any other names to alias in.
3. **Ignore** — noise / bad data / retired project. No action needed.

Two specific flags:

- **Apache-Formentera-Wrangler** — I think this came up on one of our calls around Apache / Liberty rates, but I want to confirm before creating the well. Real well, or noise?
- **Comstock Dixon 6HU 1-Alt/2-Alt/Dixon 6-1HU 1-Alt** — the only Logistiq orphan in this set, and we haven't discussed it directly. Is this a real well, or should I leave it?

Once your answers come back, the remaining maintenance work runs automatically: aliases apply, the auto-mapper re-runs against the orphan loads, full matcher re-score happens, and the counts you expected to see on Load Center should be there when we come out of maintenance.

Reply inline with row-by-row answers, or hop on a quick call whenever works — either way.

Thanks,
Jace
