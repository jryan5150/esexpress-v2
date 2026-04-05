# Email Draft — ES Express v2 Update for Dispatch Team

**To:** Jessica, Stephanie, Scout, Katie
**From:** Jace
**Subject:** ES Express v2 — Ready for Monday. Here's what's new + how to use it.

---

Hey team,

We pushed a big update to the app this weekend. Everything below is live now at **app.esexpressllc.com**. I attached a quick-start guide you can bookmark — it covers the full workflow step by step.

## What's New

**Date filtering at the top level**
You can now set a date _before_ picking a well. Set it to April 3, April 4, whatever day you're working — and you'll see all loads across all wells for that day right away. Click a load to jump into that well. The well cards also update to show that day's counts.

**Demurrage display**
When PropX has demurrage data (loader and/or destination), it now shows up in an amber section when you expand a load. Hours, minutes, and dollar amounts. If there's no demurrage data, the load calculator (rate x weight) still shows.

**BOL verification on every load row**
You'll see a small green checkmark or red warning icon next to the BOL number on each load. Green = the last 4 digits match between the load and the JotForm photo. Red = mismatch, needs a look. There's also a "BOL issues" filter tab to pull up just the mismatches.

**More data in the expanded view**
When you click a load to expand it, you now see:

- Load Out time and ETA in the timeline
- How long the truck was at the terminal and destination
- Shipper BOL and Settlement Date in references
- Dispatcher notes from PropX

**Well tabs show progress**
When you pin wells (by clicking into them), each tab at the top now shows the load count and a little progress bar — so you can see 14/30 loads without clicking in.

**Duplicate loads**
In the expanded view, there's a "Duplicate" button. Set how many copies you want and it clones the load. Good for batch building.

**Batch date setting**
Select multiple loads with the checkboxes, pick a date, hit "Apply Date" — sets the delivered date on all of them at once.

**Validation is in the main menu now**
Moved it out of the Admin section so it's easier to find. It's right below BOL Queue in the sidebar.

**Simplified login**
Just "Sign In" with Email and Password. No more operator jargon.

## How to Get Started Monday

1. Go to **app.esexpressllc.com** and sign in
2. Set the **date** at the top right to whatever day you're working
3. Click a **well** to see its loads
4. **Expand** a load (click the row) to see all the detail + edit fields
5. **Validate** as you go — single click or bulk select + "Validate Selected"
6. Use **Copy All** to grab load info for PCS entry

## How to Reach Us

**Use the purple feedback button in the bottom-right corner.** It's on every page. When you click it:

1. It automatically takes a screenshot of what you're looking at
2. You pick Issue / Question / Suggestion
3. Type what's going on
4. Hit Submit

We get the screenshot, what page you were on, and what you clicked before the issue. It's the fastest way to get us what we need to fix things.

You can also text or email me directly for anything urgent.

## What's NOT in yet (waiting on PCS)

We're still waiting on Kyle for the PCS OAuth API keys. Until we get those, here's what we can't do yet:

- **Auto-dispatch to PCS** — you still need to copy fields from the app and enter them in PCS manually (the Copy All button helps)
- **Auto-upload photos to PCS** — photos show in our app but don't push into PCS automatically yet
- **Full PCS field mapping** — rate types, carrier SCAC codes, driver name parsing for PCS

Once Kyle gets us those keys, these features are ready to turn on — the code is built, just needs the credentials.

## Quick-Start Guide

I attached the full reference doc. Bookmark it — it covers every feature, every button, tips and tricks. If something isn't in there, use the feedback button and we'll add it.

Let me know if you have any questions before Monday morning. We'll be monitoring feedback submissions over the weekend.

— Jace
