I have all the key content. Now let me assemble the full findings document.

# Validation Call Findings

## Call metadata

- **Date:** April 6, 2026, 10:53 AM MDT (transcript shows 3:53 PM UTC)
- **Duration:** 1h 14m 45s
- **Platform:** Microsoft Teams, recording + Scribe capture
- **Transcript source:** `/tmp/validation-walkthrough-call.md` (Pandoc export) and `/mnt/c/Users/jryan/Downloads/Validation Walkthrough .vtt`

**Attendees (as labeled by Teams, with corrections):**
- **Jace Ryan** — engineering
- **Jessica Handlin** — dispatch manager, primary speaker for minutes 0–53
- **Jodi** — billing (called "Jody" once in transcript). Teams diarization collapsed her under "Jessica Handlin." She took over the conversation at ~53:51 after Jessica left for a doctor's appointment and stayed through to the end
- **"Chitra"** — a third woman in the room briefly acknowledged at 51:02 ("Go ahead, Chitra"), who shared the load count sheet with Jace. Possibly the one who forwarded the logo PDF at 42:57
- **Stephanie/Scout:** NOT on this call. Jace asked for Stephanie specifically; Jessica never pulled her in. Katie (the clearer) was also offline — a follow-up call with Katie was scheduled for the next day

**High-level summary:** Jessica walked Jace through v2 live for ~50 minutes, correcting terminology, surfacing missed workflow concepts (missed loads, clearing, audit trail), and confirming field priorities on the dispatch template. She left mid-call for a doctor's appointment and Jodi finished the template walkthrough. The call produced at least 4 schema-level corrections, 5 workflow gaps Jace hadn't accounted for, and a clear redirect away from "color ownership" as the primary coordination signal.

---

## User's flagged insights — verified with quotes

### 1. "Ticket# is actually the BOL number"
**Verified and confirmed.** This was the single most important correction of the call.

> **Jessica (16:09):** "So I can go in, the ticket number is actually the BOL."

> **Jace (17:02):** "But ticket number in our system is actually BOL. And that would make a lot of sense about why my system's confused. It's taking a larger BOL value and it doesn't know that it's actually ticket number."

**Nuance the user's summary missed:** There are actually THREE overlapping identifier concepts, and the naming is collision-heavy across source systems:
- **BOL** = what Jessica's team calls "ticket number" and uses as the primary driver-searchable identifier
- **Load number** = what Liberty calls it
- **Order number** = what PropX calls it (and what v2 currently labels as "order number")

> **Jessica (16:40):** "I think a low number [load number] is actually okay. I'm comfortable with that because I actually think Liberty calls it low number and I think that Propex calls it order number."

So v2 has been mislabeling TWO fields, not one. The "BOL" value v2 was surfacing was actually a PCS assignment number aggregated from somewhere else in the payload — Jace couldn't trace it during the call (20:01–20:06, 1:03:02 "this is pulling from somewhere in all of the data that comes from the load companies. It's some aggregate"). The matching engine's 100% confidence scores are suspect because the engine was matching on the wrong field.

Jessica's operational significance: **BOL is THE payroll search key.** When a driver calls claiming they weren't paid, Jodi searches by BOL or truck number to find the load (27:00).

### 2. "Well is the destination and the destination needs to be the Loader or sandplant"
**Verified.**

> **Jessica (17:53):** "Because we have the whale [well] and then we have where we're getting sand from. And so we're used to kind of seeing that."

> **Jessica (18:07):** "So it's a little confusing because we have the whale, which is where it's actually the destination and the whale essentially are the same thing. We have a loader, that's where it's coming from."

> **Jessica (18:27):** "So we could call it loader or samplant either or."

**Nuance the user's summary missed:** Jace explicitly diagnosed the root cause — v2 inherited "destination" from the finance module and then re-exposed it alongside "well," creating a duality in the UI. His words (17:39): *"I think that's pulling, that's the dual, that's the duality coming from the finance module. So you just need one."* The fix isn't just "rename one field" — it's collapsing a finance-layer concept (destination) into the dispatch vocabulary (well = destination, loader/sandplant = origin). And Jessica is comfortable with either "loader" OR "sandplant" as the label — no strong preference — suggesting a tooltip/dual-label approach would work.

Also note the directional confusion: in Jace's prior mental model, the "well" was the origin (where sand came from). Jessica corrected that — **the well is the DESTINATION, the loader/sandplant is the ORIGIN.** This is a 180° reversal of the semantic direction.

### 3. "Date selectors need to be set for ranges"
**Verified, and it's bigger than just the date picker.**

> **Jessica (22:01):** "Being able to sort by date and not just by date, but like a date range."

> **Jessica (22:34):** "Can we do a range instead of just a day?"

**Nuance:** Jessica asked for range dates as part of a three-part "how I work" bundle at 22:01–24:41. The other two were (a) sort by well, and (b) search for a well quickly if you don't see it in the list. Jace's summary of the ask at 24:38 captures it: *"So make sure range dates and then the well sorting and then being able to search for a well quickly."* Date range is actually the LEAST load-bearing of the three — the well-search gap was her bigger pain (she hadn't discovered the `/` master search). That said, she also flagged this is part of the billing workflow, not just dispatch: *"I can jump to this whole sheet and type in the BOL and it's going to take me, you know, right to that load"* (27:00) — so whatever search/date range v2 ships has to work for Jodi's driver-lookup use case too.

### 4. "Tons need to be changed to lbs throughout"
**Verified. Also an admission of a prior spec error from Jessica's side.**

> **Jessica (19:05):** "So then the weight, and this is our fault. We told you we needed it in tons. And at the end of the game, we do need it in tons. But the way we enter it right now, what we see on our sheet and the way the girls build below, they actually use the pounds."

> **Jessica (19:29):** "Until we get away from PCS, I don't think we have to worry about it. PCS converts it. So it'll import into PCS this way, and then it does the conversion."

**Nuance the user's summary missed:** This is a **temporal** correction, not a permanent one. Jessica explicitly said tons IS the right end state ("at the end of the game, we do need it in tons"). Pounds is the transient value because that's what the dispatchers type in the sheet today, and PCS does the conversion on import. Round 4 should display pounds everywhere AND keep the ton value for billing/reporting — or, cleaner, **store canonical pounds in the DB and convert at the billing layer.** The comment "until we get away from PCS" also implies that if/when Phase C (v2 replaces PCS) happens, v2 itself will need to do the conversion — so the converter logic isn't throw-away code.

### 5. "Search needs to be more present, or more obvious"
**Verified.** Jessica literally did not know the `/` master search existed.

> **Jessica (23:15):** "Yeah. Is there a way to search like if I come to this and I'm not seeing the whale I want?"

> **Jace (23:20):** "Yeah, hit the little, the forward slash key on your keyboard. It brings up a master search."

> **Jessica (23:33):** "Maybe I'm not. Oh, okay. So perfect. Forward slash. Okay. Good."

**Nuance the user's summary missed:** Two things. First, the feature exists and works — the problem is purely **discoverability.** Jessica is the dispatch manager and she never found the `/` shortcut in her normal use. Second, once Jace explained that `/` also works for BOL search in the payroll-question scenario, Jessica immediately mapped it to Jodi's billing workflow:

> **Jessica (28:15):** "Oh yeah, I see where it says search BOLs or drivers or, so I'll just go over it... I click on it and then it kind of takes me back to here."

The follow-on problem was routing: clicking a search result didn't take her to the load drawer in context. She ended up saying *"I actually am okay with it"* (28:46) but only after Jace explained the feature. **Round 4 needs a visible search affordance** (an icon, a placeholder input, or an onboarding tooltip) — not just a keyboard shortcut.

### 6. "Missed load methodology"
**Verified. The methodology is specific and currently manual, and Jenny (billing) is the final safety net.**

Jessica's own words on the methodology (34:27–35:13):

> **Jessica:** "We do have a system to cut down on that. We just haven't been doing it well. What we used to do is at the end of every week, so Friday, I would go in and run a report for each company from say, you know, whatever, that Sunday through that Friday. And then the next week I would do the same thing and it would pull in. And what I would do is I would, it sounds kind of crazy. So I would pull up my sheet and I would just go over here and add a tab and I would pull in a new report with all the loads on there from the same day and I would have it set to where anything that was duplicated would turn red. And so then, you know, there would be four or five loads... it would alert me, oh, there's four loads. And so then I would jump in and say, hey, ladies, there was four loads, putting them on the sheet now, getting them built. I assume we could tell this system to run something like that."

The backup safety net:
> **Jessica (36:37):** "That's how Jenny catches it. Jenny, if it goes that far, if it gets all the way to Jenny and she's building an invoice, she works based on what we have and what they have. And so she might be however much money off. And so at that point, she will go into prop X and start doing the research and she'll find loads that were missed."

**Nuance the user's summary missed:** This is far richer than "there's a methodology." Three concrete findings:

1. **The methodology is currently broken.** Jessica said "we just haven't been doing it well" — the Friday diff-report ritual has lapsed. So missed loads are currently leaking through to Jenny (billing) and being discovered at invoice reconciliation time, meaning the company is likely **missing revenue** until Jenny catches it.
2. **The methodology is a spreadsheet trick.** Pull Sunday–Friday for each company, paste it into a new tab the following week, use conditional formatting so duplicates turn red, and anything that isn't red (i.e., new since the last pull) is a missed load. Jace's Round 4 implementation suggestion (37:27) was: tag each load with its import timestamp, then at end-of-day detect loads whose import time is after the original batch window for that period — "well, this load doesn't match with, you know, the rest of my time data for this time period. So it must be missed."
3. **There's a second-order data discovery implication.** If missed loads are currently slipping to Jenny, then v2 has a latent **revenue recovery feature**: running the diff against historical sheet data could surface uninvoiced or underpaid loads from the last 90 days. This is the highest-ROI framing for the missed-load feature.

### 7. "Adding audit trail to the load drawers"
**Verified.** Triggered by Jessica describing what she LIKES about PCS (which is rare).

> **Jessica (47:06):** "Like right now, one of the things in PCS that we do, and like we said, we don't love PCS, but one of the things I do like about it is anybody who's touched that load or done anything with it, and like down at the bottom of the screen, it shows like, yeah."

> **Jessica (49:37):** "Under the timeline, would that would would it be there? I know that's all for the load, actually load out, load in delivered, then would it show there?"

> **Jace (49:44):** "We can have that, like an audit log. I think that's a great idea. We can just have, so instead of having this all out, right, I think what we do is we collapse the timeline. You can pull it open if you want to, right? But we collapse it, and then underneath it, we have an audit log that's the same."

> **Jessica (49:46):** "It shows who's done what to that. Yeah, somebody, somebody cleared the load or somebody re-dispatched the load or somebody changed the rate or..."

**Nuance the user's summary missed:** Jessica named the specific events she wants tracked: **(1) who built/touched the load, (2) who cleared it, (3) who re-dispatched it, (4) who changed the rate.** These are the four event types the audit log needs at minimum. The audit log is not abstract observability — it's a dispatcher-facing "who touched this ticket" view that replaces the PCS feature she already relies on.

She also linked it to the layout: **collapse the current timeline** (load out / load in / delivered) by default and put the audit log in the same visual region, pull-open on demand. So this isn't an additive feature; it's a UI reorganization of the load drawer bottom-pane.

---

## Insights the user DID NOT flag (the meta-task gold)

### A. The chain/color metaphor got corrected — Jessica redirected to "audit log + live presence" instead
**This is the single biggest shift in the strategic doc.** Jace asked directly about the chain and colors:

> **Jace (46:03):** "Is the chain concept correct? Is that how we need to like, you know, go about this as in a... like, okay, this is how I know it's ready for the next round kind of thing. Do we need to have some kind of queue for that? I mean, yeah. And does it need to be specific? Do we want to keep the colors, right? Because we're not surfacing them right now, right? But if that's helpful..."

Jessica's response pivoted away from personal-color ownership and toward the PCS audit-trail pattern:

> **Jessica (46:32):** "My question is, sorry, go ahead. No, I, well, I was, I'm just trying to think this through if we're not going to have these sheets. And if it, if it's all pulling directly in, I know you and Jessica had these conversations, she had a call and had to walk out. So these colors, like you're looking, if you're on the sheets and we're looking at one and everything's shaded blue, that means we know that whoever built those loads, that's why they're shaded blue. If they're highlighted red, there's a problem, they're not built, um..."

Then Jodi (labeled "Jessica Handlin" at 47:06) explicitly reframed:

> **Jodi (47:06):** "Like right now, one of the things in PCS that we do, and like we said, we don't love PCS, but one of the things I do like about it is anybody who's touched that load or done anything with it, and like down at the bottom of the screen, it shows like, yeah... So do we want to use colors or could we actually use like..."

And the final decision at 50:10–52:03:

> **Jodi (50:10):** "Okay, so what he was asking, this went into this whole conversation was like on the sheet, if you got over on the sheet and you're looking at the colors, do we want to stick with those colors? Like red is not filled. And he said that Scout and Stephanie actually have something where they know who's working on what when their stuff is shaded. I know at some point the sheets are going away, but do we want to stick with that?... Do you want to do color coding or can you do, can you use like a... You know, have the like a check box like... I'm gonna have to go and come back. I have a doctor's appointment. Like pending, assigned, reconcile, ready to build. Okay, gotcha. The colors I do like are [gestures at sheet]..."

> **Jessica (51:56):** "Yeah, and actually, yeah, let's use these colors. I think missing ticket, missing. If we were going to do a color coding, let's use these colors."

> **Jace (52:03):** "Yeah, and then we can cover the user basis with just the audit trail and then their, you know, live action kind of pop-ups."

**Why it matters — the correction to the strategic doc:**
The strategic doc's chain framing says "color = ownership = handoff signal" and v2 should render assignedToColor as the primary signal of "whose turn is it next." **Jessica and Jodi rejected that framing.** They want colors for **STATUS classification** (missing ticket, not built, BOL issue, etc. — corresponding to the load-count sheet's existing legend) NOT for personal ownership. For personal ownership, they want the PCS-style audit trail pattern — a "who touched this" log at the bottom of the load drawer, plus the live-presence indicator Jace demoed at 48:37.

The personal-color system Scout named as "we're all part of a chain" is real, but it's **not the coordination backbone Jessica wants v2 to replicate.** She considers it a sheet-era workaround; she'd rather have proper audit + presence. This is a significant redirect.

### B. Live presence/co-editing already exists in v2 and Jessica reacted positively
Jace demoed the "live track" feature at 48:37:

> **Jace:** "I added this live track feature where you can see if I'm in there with you."

> **Jessica (48:41):** "They're gonna two, you can have two people in the load at one time, pinch."

> **Jace (48:53):** "Well, you can have multiple, like you can have as many as you want to, because you see down here now it shows there's two people online, me and Jessica."

> **Jessica (49:07):** "Ohh yeah, yeah, yeah, OK, and if you do something..."

**Why it matters:** v2 already has a feature the team doesn't know about that *partially* solves the "who's working on this" problem. Like the `/` search, it's a **discoverability** problem, not a build problem. And importantly, live presence is what Jessica pivoted to as a replacement for personal colors — she was enthusiastic. Round 4 should make live-presence visible on the home dispatch desk list view (not just inside the drawer), likely as a small avatar badge on the row.

### C. "How is it 100% confirmed if there's no photo?" — the Tier 1 auto-approve rule is WRONG
This one goes against a core v2 matching-engine assumption.

> **Jessica (12:05):** "I have a couple of questions. How is it 100% confirmed if there's no photo?"

> **Jessica (14:02):** "I don't feel like anything can be 100% because we don't want it to push out to PCS unless it has the photo anyways. And so I don't feel like it can be, you know, 100% without that."

**Why it matters:** The v2 matching engine currently assigns 100% Tier 1 confidence based on field-level matches even when no photo is attached. Jessica's rule: **no photo → cannot be 100%, cannot push to PCS.** Photo presence should be a gating precondition for any "ready to dispatch" state, not an orthogonal attribute. This is a one-line rule change (`isTier1 = isTier1 && hasPhoto`) but it has downstream implications for the whole validation queue — probably 30–40% of currently-green loads should drop to a "needs photo" state.

Jace immediately agreed: *"So, so don't say 100%, so maybe get rid of that kind of visual cue"* (14:06).

### D. Dispatchers do NOT want to work from the Validation page day-to-day
> **Jessica (10:18):** "I like the validation page for if and when we get to the point that this is, you know, like 100% that we can come here and approve all the tier ones. I do like that. I don't know that we will work from this page a whole lot."

> **Jessica (11:25):** "That will be one part, one part, I mean, I'll say one person, it could, you know, somebody else could potentially jump in and do this, but really I think one person's going to do all or 90% of the validation."

**Why it matters for the four-surface model:** The strategic doc's four-surface model is confirmed at the end of the call (1:10:58, Jessica says "yep" to workbench/reconciliation/oversight), BUT **Jessica just told Jace the reconciliation surface is a one-person job** — not a team surface. That means the Validation page (surface 2) should be optimized for a single power user, not for collaborative triage. This also validates Jace's assumption that a dedicated validator role exists, but means:
- The validation queue should be single-assignee with a "claim" pattern (like a ticket queue), not a shared board
- UX density matters more than discoverability on this surface — the user is in it all day
- Real-time collaboration features (multi-cursor, live presence) matter less on this surface than on the Dispatch Desk

### E. The sheets are staying longer than the strategic doc assumes — because of Jodi's reporting
> **Jessica (25:08):** "Jodi was like, okay, but what about the sheets? Like if the girls aren't using the sheets, they're no good to me, but I reference the sheets. And so we're wondering on just like reporting and I can kind of explain to you that process."

> **Jessica (25:55):** "Well, at some point, it's going to be really challenging for the girls to work here and on the sheets."

**Why it matters:** The strategic doc's bridge → REST → replacement framing assumes the sheets get replaced. Jessica is telling Jace that **the sheets have a second consumer (Jodi/billing) that Jace's mental model doesn't account for.** So there's actually a **fourth consumer surface** — a billing reporting view — that v2 needs to eventually serve, or Jodi is going to keep asking dispatchers to maintain the sheets in parallel, which is Jessica's operational fear ("challenging for the girls to work here and on the sheets"). This is a **latent fifth surface** ("Billing Reporting") that the strategic doc doesn't name.

This is also why Jace's idea of a nightly reconciliation job against the sheets (15:01) makes sense as a bridge — Jodi's consumer doesn't know or care where the data came from, as long as her reports work.

### F. Comment/issue note system on load drawers
> **Jessica (29:41):** "Pending or BOL issues. Would there be a way for us to note on there like what the issue was?"

> **Jessica (29:57):** "Yeah, and it could even be its own tab, like comments. And then obviously if it said pending or BOL issue, and then there was like a comment section over here, we could, you know, write a comment. And then when Jodi saw that, she would be able to relay to the driver, like, what, you know, what was wrong, why he didn't get paid that load."

**Why it matters:** The strategic doc has no notion of free-text annotations on loads. Jessica is asking for a comment/issue-note field scoped to the load, surfaced on the drawer, used as cross-team communication (dispatcher → billing → driver). This is a small feature with high coordination value. It also **competes for space in the load drawer** with the audit log, so the drawer's bottom pane needs a tab pattern: Timeline / Audit Log / Comments.

### G. Inline load editing from the dispatch desk — already exists, not discovered
> **Jessica (31:32):** "Just a couple things I wasn't seeing that we had talked about was how to edit... these loads either from the..."

> **Jace (31:43):** "Okay, so you can just click on it. So just click on Michael or Truck and it's inline."

> **Jessica (31:49):** "Oh, okay, perfect. And that's on validation as well. Like if I go..."

> **Jace (31:51):** "So I have to add it on validation. That's the one I stopped whenever."

**Why it matters:** Another discoverability gap. Inline editing exists on the Dispatch Desk but **not** on the Validation page, and Jessica wanted it in both places. Round 4 has a small scope item: port inline editing from Dispatch Desk to Validation. And it confirms the broader pattern: **Round 4 needs a "what's new in v2" discovery tour**, because we keep shipping features the team can't find.

### H. Syncing is currently stopped (Jace paused it); loads cut off April 2
> **Jessica (31:58):** "I'm only seeing loads through April 2nd."
> **Jace (32:25):** "OK, and I stopped, I stopped doing syncs."

**Why it matters:** This is an operational blocker, not a workflow insight, but worth flagging: **the team is working with stale data from 4 days ago.** When Round 4 kicks off, syncs need to be re-enabled BEFORE the corrected field mappings ship, or the re-sync will propagate wrong-labeled data forward. Jace knew this — he paused sync intentionally to avoid compounding the BOL mislabel — but Jessica caught it and asked. This dependency should be in the Round 4 sequencing plan: (1) ship corrected mappings, (2) purge & re-sync, (3) re-enable live syncs.

### I. The "clearing" workflow is a THIRD-PARTY system action, not internal
This is the biggest workflow misconception the strategic doc has. The prep doc's Question 3 asks "Is clearing a separate thing from marking entered?" and assumes Katie does clearing inside v2 as a verification step. **That's wrong.**

> **Jessica (38:23):** "We clear the loads in... I always want to call it automatize them, that's not what it is. Anyway, Logistics. So we clear the loads in logistics and ProfX on their system before, you know, before we can invoice them out."

> **Jessica (41:20):** "This part of clearing, it just happens like during the week. So we pull the information when we, you know, we pull this report in, but then before we can invoice out, she has to approve it on their, this is completely on their end. It's just something that celebrity and logistics makes us do part of their job."

> **Jessica (41:42):** "We have to go and approve these loans before they will pay us."

**Why it matters — massive correction to the strategic doc:** "Clearing" happens in the **external customer systems (Logistiq and PropX)**, not in v2 or PCS. Katie logs into Logistiq and PropX and clicks a "confirm" button on each load to approve it for payment. This is a PAYMENT-GATING step imposed by the shippers, not an internal verification.

The implications are significant:
1. **v2 doesn't "own" clearing.** The strategic doc's "clear" stage in the INGEST → MATCH → VALIDATE → BUILD → CLEAR → DISPATCH → DELIVER → BILL pipeline is factually wrong — clearing happens in parallel/external, not in v2's flow.
2. **v2 needs to OBSERVE clearing, not drive it.** Jessica and Jace immediately agreed (41:45) that v2 should reflect the clearing status via the external APIs: *"I can probably connect that, that status change. So like when she does it, there's a transfer over. So that way it's something that is seen."* Jace was confident the PropX and Logistiq APIs expose the clearance status: *"I studied their API call list. And I can just connect it."*
3. **There's a timing/race condition the team is worried about.** If v2 pulls loads before Katie has cleared them in the external system, and then Katie changes the weight or other fields during clearing, v2's copy is stale. Jessica raised this (38:56): *"We're going to have to think about that."* She proposed two options (39:13):
   - **(a)** Only pull already-cleared loads (delay v2's ingest by 24–48 hours)
   - **(b)** Pull immediately but subscribe to change notifications so v2 updates when Katie makes edits downstream
4. **There's a new field to surface:** `reconcileStatus` (the PropX term). Logistiq has a similar field with a different name (to be confirmed with Katie). v2's load drawer needs a "Clearing Status" badge showing PropX + Logistiq status values pulled bidirectionally from their APIs.

This is arguably the single most important correction in the call, and it was not in the user's summary of flagged insights.

### J. Jessica explicitly confirmed the four-surface model at the very end
> **Jace (1:10:58):** "We surfaced it with the model that was intuitive to me is kind of, and we'll change it, like the workbench, which is where the loads get built. And then there's like a reconciliation piece, oversight. Which is, you know. where you view it, the objectives, kind of the higher level, like a manager kind of view. And that's where I would see the billing kind of going into play there... those three were what I came across with as the most important. Does that track?"

> **Jessica (1:11:30):** "Yep."

> **Jessica (1:11:45):** "I think so. Yeah, yeah, yeah, yeah."

**Nuance worth flagging:** Jace only named THREE of the four surfaces in his summary question (workbench, reconciliation, oversight — he dropped configuration). Jessica agreed, but she was agreeing to THREE, not four, and she was also agreeing at minute 71 of a 75-minute call, visibly wrapping up. This is a **soft confirmation, not a rigorous validation.** The four-surface model should be considered "not contradicted" rather than "endorsed."

### K. Jessica does NOT see the Dispatch Desk as THE primary workspace either
> **Jessica (10:18):** "We had talked about maybe having just having the dispatch desk or maybe not. So I'm not sure. I'm honestly not sure what's best because I know this isn't going to look exactly like what we're used to and that's okay."

**Why it matters:** This is the opposite of what the strategic doc assumes. The doc treats the Dispatch Desk as the "daily workbench" (Surface 1) for Stephanie/Scout. Jessica is signaling she's **unsure whether the desk is the right frame at all**, and she's comfortable with v2 not looking like the sheets. She's not attached to the current Dispatch Desk design. This is a permission slip: **Round 4 can radically rework the Desk's layout** and Jessica won't resist, as long as the underlying workflows work.

### L. Help system / legend UI was requested (Microsoft Paperclip analogy)
> **Jodi (52:06):** "But what do you call it on a map when it gives you like, would there be like a map that would like tell like some of us who don't work in the loads every day, but actually have to go investigate loads and stuff, there'll be a map that says purple is missing tickets or whatever."

> **Jace (52:43):** "Like a key or a legend... [like] you know how Microsoft used to have those little assistants back in the day, like the paperclip? It can be like that, but a little simpler."

**Why it matters:** The team has **occasional investigators** (Jodi, probably Jenny) who need to interpret dispatch data but don't live in it daily. v2 needs an always-visible legend affordance — a floating help/glossary widget that explains color codes, status values, and the vocabulary. This is a **multi-tenant/role-aware documentation** feature, not just a one-time onboarding tour. Critical for the "billing looks at dispatch data" crossover that Jessica described.

### M. Fuel surcharge is coming back
> **Jessica (1:01:14):** "Yes, we're doing fuel surcharge now. That's correct."

**Why it matters:** FSC was presumably off the data model or deprioritized. It's now back in the template and must be captured in v2's load schema. Small schema change, but easy to miss.

### N. Unload Appointment is still needed (because demurrage math depends on it)
Jessica initially said unload appointment could go away (1:05:22), then corrected herself:

> **Jessica (1:05:51):** "What did I just, I told them unload appointment. Maybe we need to leave that in there then. Yes, leave the unload appointment in because that will be, if we start, if the demurrage comes into play and that's one of the things that they have to have us go by that we will need that."

**Why it matters:** Don't drop `unloadAppt` from the schema based on a first read. Demurrage calculation requires it. This is a good example of Jessica catching her own wrong answer in real-time.

### O. Demurrage math is SHIPPER-SPECIFIC and the team doesn't have a single formula
> **Jessica (55:44):** "There is math behind it, but the demurrage is so tricky because last time we had to [calculate] demurrage, it was every company was different on how they paid. And so it would be like... so on this well, they'll pay demurrage after the truck spends 12 hours at the well and then they only pay it for up to 12 hours and then your 24 hour period starts over. Or they would say some of them would do it by, they would pay it by whatever their appointment time was."

> **Jessica (56:23):** "You had to give them 8 hours of time to get unloaded. And that after 8 hours after that appointment time, you had that unloaded your load, then you would start getting paid to demurrage. So you would have to be able to go back and see like what the appointment time was. I mean, it's all different. So there is math."

**Why it matters:** Demurrage is not a single formula — it's a **per-shipper rule engine**. Round 4 cannot ship a "demurrage calculator" as a single function; it needs a rules-per-shipper configuration (probably per-well, since wells map to shippers). This is a significant scope item. The display of demurrage in the current drawer shows "0" because the rules aren't configured — Jessica said the 0 is correct until the rules exist.

### P. Field inventory on the master template — Jessica's actual keep/drop list
Jessica did the field-by-field walkthrough Jace requested. Summary of explicit decisions (59:17–1:06:33):

**DROP (go away):**
- Invoice # — "doesn't need to be on"
- Settlement Date — "can go away"
- ES Express # — "that's when we build that load into PCS, we're going back and adding that number again" (duplicate of PCS assignment)
- Hairpin Express # — "can go"
- Extra — "I don't know what extra is. That can go away."
- ETA — "we can probably get rid of that one"

**KEEP explicitly:**
- PO — "the PO is important. That can stay"
- Ticket # — keeps, because it IS the BOL
- Order # — Liberty load number / PropX order number
- Miles, Product, Loader, Shipper — "obviously all the" (kept)
- Load In, Load Out — kept
- Weight (as pounds, not tons) — kept
- Unload Appt — kept (for demurrage)
- Unload In, Unload Out, Unload Time — kept (demurrage)
- Fuel Surcharge — kept (coming back)

**HIDE for now, bring back later:**
- Status field — "Well, status you can have later. It's always something we can hide and unhide whenever... eventually be able to live track the status"

**NEW (not on current template):**
- BOL as its own field (Jessica: "we could put that in there somewhere")

**Jessica's summary at 1:06:12:** "If we're getting down to then, it looks like all the rest of it probably, I know it's a lot, but it probably is important."

**Why it matters:** The strategic doc's Q4 assumed 14 of 38 fields shipped and 24 pending. Jessica's actual cut is closer to **28–30 keep, 6–8 drop.** Round 4 should not ship "just the 6 that matter" — Jessica wants most of the template. The prioritization should be by data availability (what the APIs give us) rather than by Jessica's keep-list.

### Q. Manual load entry is a real workflow (not edge case)
> **Jace (1:10:11):** "Or is it something that the company sends? Yeah, like a manual way to build the load."
> **Jessica (1:10:19):** "To build a load. No."
> **Jace (1:10:24):** "without, like if it's not coming through those systems, do you have situations where you manually build?"
> **Jessica (1:10:24):** "Yeah, right. Yeah, we do. Yes."

**Why it matters:** Manual-entry is a real use case that v2 is apparently adding in this round. Jessica confirmed it exists. Also note Jessica mentioned **JRT** as a carrier that doesn't have an API and currently gets uploaded via sheets (1:09:26). Round 4 might need a "CSV upload" or "template paste" fallback pathway for JRT-style carriers.

### R. Live dispatching is still happening via sheets for some wells
> **Jessica (1:09:26):** "So, but then, for like the wells that were live dispatching, J.R.T. is gonna use sheets, and but there's a way to upload that already."

**Why it matters:** There's a subset of operations where v2 isn't in the loop at all — live dispatching for JRT wells still uses sheets exclusively. Round 4 needs to decide: does v2 absorb this, or does it stay out? Jessica's tone suggests she considers this fine as-is.

---

## Direct corrections to the strategic doc

| # | Doc section | Original assumption | Jessica's correction | Implication for Round 4 |
|---|---|---|---|---|
| 1 | Chain framing (Q2) | "Color = ownership = handoff signal. The chain is the heart of how the team works." | Colors are for STATUS (missing ticket, not built, BOL issue), NOT for personal ownership. Personal ownership should use PCS-style audit trail + live presence. | Rework: audit log (surface D above) + live presence (surface B above) replace color-as-ownership. Colors become a status legend tied to the count-sheet taxonomy. |
| 2 | Temporal pipeline | INGEST → MATCH → VALIDATE → BUILD → **CLEAR** → DISPATCH → DELIVER → BILL | "Clearing" is external to v2 — it happens in Logistiq and PropX, imposed by shippers. v2 observes, doesn't drive, the clear step. | Remove "Clear" as a v2 lifecycle stage. Add a `clearingStatus` field pulled bidirectionally from PropX/Logistiq APIs. Show it as a badge in the drawer. Decide the sync-timing race (pull cleared-only vs. pull early + re-sync). |
| 3 | Ticket # field | `ticketNo` is a separate ticket identifier | `ticketNo` IS the BOL number | Rename field DB-wide. Fix the matching engine (it's matching on the wrong field). Re-sync. Add BOL as an explicit label everywhere in the UI. |
| 4 | Well / destination | Well is a location the driver goes to pick up from | Well IS the destination (delivery point). Loader/sandplant is the origin. | Reverse the semantic direction in the schema. Collapse the finance-side `destination` field into `well`. Rename loader fields clearly. |
| 5 | Weight units | Tons | Pounds until post-PCS. Tons is the end state. | Store pounds canonically, convert at billing layer. |
| 6 | 100% confidence auto-approve | High-confidence field matches = Tier 1 / 100% | No photo → cannot be 100%, period. Photo is a gating precondition. | Change matching rule: `isTier1 = hasAllFieldMatches && hasPhoto`. Re-score the whole queue. |
| 7 | Validation page as a team surface | Multiple dispatchers collaborate on validation | One person does 90%+ of validation. | Optimize for single power user: density over discoverability, claim-based assignment if multi-user. |
| 8 | Missed-load methodology | Not named in doc | A weekly diff-report ritual exists but is currently broken. Missed loads are leaking to billing. | Ship automated missed-load detection as Round 4 high priority (revenue-recovery framing). |
| 9 | Reconciliation loop ownership | Jessica + Katie fix Tier 2/3 and BOL mismatches | Jessica doesn't think she'll work from the Validation page "a whole lot." It's a single dedicated role. | The strategic doc overstates Jessica's day-to-day involvement in validation. |
| 10 | Four-surface model | Workbench / Reconciliation / Oversight / Configuration | Soft-confirmed at end of call, but only three were named. Jessica also expressed uncertainty about whether the Dispatch Desk is the right primary frame. | Four-surface model is "not contradicted." But there's latent Surface 5 (Billing Reporting, for Jodi/Jenny) that the doc doesn't name. |
| 11 | Admin blocker (daily target editing) | Q6 predicted editing `dailyTargetLoads` would be THE blocker | **Never came up.** Jessica did not flag daily target editing once in 75 minutes. | The daily-target-editing blocker is likely not the top admin priority Jessica feels. The top priorities she actually named: missed loads, audit trail, search, field corrections. Daily target editing drops in priority. |
| 12 | Stephanie's keyboard nav (Q7) | Predicted Stephanie's keyboard workflow was a key question | **Stephanie wasn't on the call.** Never answered. | Carry Q7 forward to a direct Stephanie session. |

---

## Verbatim dispatcher quotes worth capturing

1. **Jessica on her actual working reality:** *"I like the validation page for if and when we get to the point that this is, you know, like 100% that we can come here and approve all the tier ones. I do like that. I don't know that we will work from this page a whole lot."* (10:18)

2. **Jessica rejecting the 100% framing:** *"I don't feel like anything can be 100% because we don't want it to push out to PCS unless it has the photo anyways."* (14:02)

3. **Jessica landing the BOL insight:** *"So I can go in, the ticket number is actually the BOL."* (16:09) — Said almost in passing. The biggest single correction of the call, delivered in 12 words.

4. **Jessica on weight units (self-admitted prior error):** *"So then the weight, and this is our fault. We told you we needed it in tons. And at the end of the game, we do need it in tons. But the way we enter it right now, what we see on our sheet and the way the girls build below, they actually use the pounds."* (19:05)

5. **Jessica on search discoverability:** *"Is there a way to search like if I come to this and I'm not seeing the whale I want?"* (23:15) — She didn't know `/` existed.

6. **Jessica on the parallel-sheet problem:** *"Jodi was like, okay, but what about the sheets? Like if the girls aren't using the sheets, they're no good to me, but I reference the sheets."* (25:08)

7. **Jessica on the parallel-sheet anxiety:** *"Well, at some point, it's going to be really challenging for the girls to work here and on the sheets."* (25:55)

8. **Jessica describing the missed-load ritual:** *"What we used to do is at the end of every week, so Friday, I would go in and run a report for each company... I would pull in a new report with all the loads on there from the same day and I would have it set to where anything that was duplicated would turn red."* (34:27)

9. **Jessica on the billing safety net:** *"Jenny, if it goes that far, if it gets all the way to Jenny and she's building an invoice, she works based on what we have and what they have. And so she might be however much money off. And so at that point, she will go into prop X and start doing the research and she'll find loads that were missed."* (36:37) — This is a missed-revenue flag that the dev team should hear.

10. **Jessica on clearing being external:** *"We have to go and approve these loans before they will pay us."* (41:42) — One sentence that kills the "clearing is a v2 step" assumption.

11. **Jessica's moment of value acknowledgment:** *"This has been extremely helpful. This has shown me where I've been wrong in assumptions, and that's exactly what I needed to see before we move forward."* — Actually Jace said this at 42:45, but Jessica's reply at 42:57 *"Yeah, several things, yeah."* is her soft confirmation that she corrected him on multiple things.

12. **Jodi on the audit trail desire:** *"It shows who's done what to that. Yeah, somebody, somebody cleared the load or somebody re-dispatched the load or somebody changed the rate."* (49:46) — Specific list of audit events she wants tracked.

13. **Jodi invoking the Clippy reference:** *"What do you call it on a map when it gives you like, would there be like a map that would like tell like some of us who don't work in the loads every day, but actually have to go investigate loads and stuff, there'll be a map that says purple is missing tickets or whatever."* (52:06)

14. **Jessica on the hardware limitation (mouse):** *"Can you do it because my hand doesn't work?"* (54:54) followed by *"Maybe I'm used to using a mouse. This is tricky."* (55:00) — Reveals accessibility constraint: Jessica can't scroll easily on the device. Might indicate a laptop trackpad issue or a physical limitation. Worth remembering when UX-testing scroll-heavy surfaces.

15. **Jessica on demurrage complexity:** *"Every company was different on how they paid... I mean, it's all different. So there is math."* (55:44) — Demurrage is a rule engine, not a formula.

16. **Jessica validating the field reality:** *"If we're getting down to then, it looks like all the rest of it probably, I know it's a lot, but it probably is important."* (1:06:12) — Not "ship the 6 that matter"; closer to "all 30 matter."

---

## Open questions surfaced by the call

1. **Clearing race condition:** Pull uncleared loads immediately (and re-sync) vs. only pull cleared loads (delay by 24–48 hrs)? Jessica proposed both, no decision. Needs Katie's input.

2. **Logistiq's equivalent to PropX's `reconcileStatus`:** Jessica couldn't remember the exact field name. Jace will check via the API. *"It's similar, but it's not called reconcile status."* (43:27)

3. **JRT live-dispatching wells:** Does v2 absorb this workflow, or leave it in sheets? Jessica seems fine leaving it.

4. **The "assignment number" / third BOL-like field:** Jace surfaced a PCS assignment number that his system had been treating as BOL. Needs full schema audit to trace where it's coming from. *"I will figure that out and fix that."* (1:04:00)

5. **Demurrage rules per shipper:** Who owns capturing the rules per shipper/per well? Jessica offered to find an old email with the rules: *"I should try to go back and find an email when we actually had that and send it to you."* (55:44) — Needs follow-up.

6. **Stephanie's actual keyboard workflow:** Not validated. Needs direct session.

7. **Katie's clearing walkthrough:** Deferred to a next-day meeting. Jessica committed to setting it up.

8. **The second logistics login URL:** Jessica couldn't produce the correct Logistiq URL during the call (`LOGLOGISTIXIQ.io/login` didn't work). Needs to be captured for Jace's API integration work.

9. **Comment/issue notes scope:** Who sees them? Are they role-scoped (dispatcher → billing)? Immutable or editable? Not specified.

10. **The Jodi/Jenny/Chitra role map:** Jace's mental model still doesn't cleanly distinguish Jodi (billing) from Jenny (invoice reconciliation) from the unnamed woman (Chitra? Jodi?) who forwarded the logo. Personas need updating.

---

## Round 4 implications

Based on this call, the Round 4 priority order should change as follows:

- **NEW P0 — Field rename cascade (BOL/ticket, well/destination, loader/sandplant, tons→pounds).** This unblocks everything else because the matching engine is running on wrong labels. Must ship first, then re-sync.

- **NEW P0 — Matching engine photo-gate.** One-line rule change: no photo → not Tier 1. Re-score the queue.

- **P0 stays — Audit trail on load drawer.** But reframe it: it's replacing the chain/color concept, not supplementing it. Four minimum event types: built, cleared, re-dispatched, rate-changed. Collapse timeline by default, pull-open on demand. Tab pattern: Timeline / Audit / Comments.

- **P0 stays — Missed-load detection.** Reframe as revenue recovery. Jace's proposed implementation (metadata tag per import time, diff against period batch) is tractable. Ship weekly run first, automate later.

- **P1 (NEW) — Clearing status badge.** Bidirectional pull from PropX and Logistiq `reconcileStatus` fields. Read-only in v2. Surface on the load drawer. Gate invoicing on it.

- **P1 (NEW) — Comment/issue notes on load drawer.** Scoped to the load, visible to billing. Jodi is the primary consumer.

- **P1 (UP from lower) — Search discoverability.** The `/` shortcut is invisible to users. Add a visible search affordance on the Dispatch Desk header AND on the Validation page. Wire it to route directly to the load drawer, not back to the list view.

- **P1 (UP) — Inline editing on Validation page.** Port from Dispatch Desk where it already works.

- **P2 (DEMOTED) — Daily target admin editing.** Jessica did not flag this once. It's an engineer's assumption, not a dispatcher's pain. Keep it on the roadmap, but it's not the top admin blocker.

- **P2 (DEMOTED) — Keyboard nav for Stephanie.** Stephanie wasn't on the call. Don't design without her input. Schedule a dedicated Stephanie session before any keyboard-nav work.

- **P2 — Live presence as a row-level indicator.** Already exists in the drawer; surface it on the Dispatch Desk list view as avatars. Marketed to Jessica as "the PCS audit-trail-lite feature you said you liked."

- **P2 — Floating help/legend widget.** Clippy-style. For Jodi/Jenny/investigators who don't live in the app daily.

- **P3 (NEW) — Demurrage rules engine (per shipper).** Don't ship a calculator. Ship a rules config per-shipper/per-well. Data-gather first from Jessica's old emails.

- **P3 (NEW) — Billing reporting surface (latent Surface 5).** Scope TBD, but acknowledge in the strategic doc that Jodi's reporting needs are not served by the current four surfaces and will eventually need their own view.

- **P3 — Manual load entry + CSV/template upload fallback** for JRT-style no-API carriers.

- **Housekeeping — Re-enable sync after Round 4 field renames ship.** Current syncs are stopped, data is stale as of April 2. Sequence: (1) ship renames, (2) purge, (3) re-sync, (4) re-enable live sync.

- **Discoverability tour/changelog.** Jessica didn't know about `/` search, inline editing, or live presence. Round 4 should ship a "what's new" modal or tour that flags existing features to the team.

---

**Closing observation for the parent agent:** The single biggest meta-finding is that **Jessica accepted the chain framing as an observation of past behavior but rejected it as the v2 coordination model.** She wants PCS-style audit logs and live presence, not colored row ownership. The strategic doc's emotional centerpiece ("we missed the chain") is half-right: yes, the engineering team missed it, and yes, it's how the team works today via sheets — but Jessica considers it a workaround, not a pattern to preserve. Round 4 should build the audit-log-plus-presence model and let the color system drop into a status-only role matching the load count sheet's existing legend.

The second biggest meta-finding: **clearing happens outside v2.** This changes the pipeline diagram and introduces a bidirectional integration requirement that wasn't in the plan.

The third: **there's a revenue leak through missed loads that Jenny is currently catching late.** Framing the missed-load feature as revenue recovery, not workflow hygiene, is the highest-leverage business case the project has.