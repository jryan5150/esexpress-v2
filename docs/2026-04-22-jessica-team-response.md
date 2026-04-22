**Reply-all to Jessica's thread. Recipients on her email: Jess, Jeri, Bryan. Note: Jessica says she copied Mike but Mike isn't actually on the recipient list — add him manually if you want him on the thread.**

---

**Subject:** Re: OK to hold maintenance window through Monday morning?

---

Jessica (and Jeri, Bryan) —

Thank you for the directness. I owe the team a clearer picture than I gave in the Monday ask — what I framed as "hold the window for final polish" understated what actually needed to happen in it.

What surfaced this week — the April 20 batch-clear attribution gap, the Formentera / Briscoe silent mis-matches, the orphan wells Jessica confirmed this morning, the photo-drawer reload issue — each one pointed at updates to the underlying data and matcher logic that required full-corpus operations: a full photo rescan, clean-up scripts run against the entire load and assignment history, a matcher re-baseline across every load, and reassignment of ~2,000 loads onto the correct wells. Up to this point those corpus-wide operations hadn't been run; the product had been running on what was effectively accumulating data debt.

Late last night into this morning, once the audit results came in, the picture got clear enough to make a decision. Trying to push through without doing this work would have carried that debt directly into PCS cutover, where the same operations turn from "maintenance window" into "live-ops incident with customer impact." That isn't the outcome any of us are aiming for. My oversight was not making this framing clear in the Monday ask; that's on me.

**Given all of that actually ran this week**, here's where we land:

**Already in place today, not waiting on Monday:**

- Matcher re-baselined across the full corpus.
- April 20 mass-clear reverted or attributed — drawer audit trail shows who changed stage and when for every load.
- Orphan loads routed to the correct wells, including the 7 new wells from Jessica's reply this morning.
- Formentera / Briscoe silent mis-matches corrected; loads now point at the right wells.
- BOL vocabulary unified across Load Center / BOL Center / Load Report / validation pages.
- Wells admin value fields live (rate per ton, FFC, FSC, mileage, customer, loader).
- Magic-link sign-in live alongside the password flow.
- Photo drawer fix — BOLs render in the drawer without the reload issue.

What remains between now and Friday: matcher-confidence sanity pass, reconciliation workflow against your sheets (once the service account has access), and the PCS push smoke test. None of those require the site to be offline — they run alongside.

**Given that, two options for the team:**

1. **Hold to Monday 4/27 as originally asked.** Same plan, same outcome.
2. **Friday 4/25 EOD — site open for validation, PCS toggle off.** Team uses it for daily validation exactly the way you described — product running, team validating, no PCS push. Remaining hardening runs in the background through the following week. Anything that surfaces, we fix live.

After seeing where the audit actually landed and keeping the team's ultimate goal in mind, Friday is the cleaner call.

**On the "another week from PCS, into a new billing month" concern.** PCS push is a toggle on the Settings page, OFF by default, admin-controlled. Whoever on your team has admin rights flips it whenever you decide. That means validation week and the PCS-push decision are on separate clocks — if you want a week of validation first, start Friday and push the 2nd; if you want to push sooner, that's your call the moment you have confidence. I'm not picking a go-live date; you are.

**On "IF it works"** — happy to walk through the system live with you, Jeri, or anyone else on the team before you commit time. 30 minutes Thursday or Friday morning.

**On the reconciliation report you asked for** — I'll send a separate email today with daily load counts per well against your sheet counts, plus load-number drill-down for any well you want to dig into.

Mike, Jeri — my recommendation is **Friday EOD open for validation, PCS timing separate and yours**. If Monday reads cleaner for your team, we stay with Monday. Either way, the PCS toggle decouples.

Thanks,
Jace
