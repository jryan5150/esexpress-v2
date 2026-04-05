# ES Express v2 — Quick Start Guide

**For:** Jessica, Stephanie, Scout, Katie, and dispatch team
**App URL:** [app.esexpressllc.com](https://app.esexpressllc.com)
**Updated:** April 5, 2026

---

## Logging In

1. Go to **app.esexpressllc.com**
2. Enter your **Email** and **Password**
3. Click **Sign In**

If you can't log in, use the feedback button (purple circle, bottom-right corner) or email/text Jace.

---

## Main Navigation (Left Sidebar)

| Page                   | What It Does                                                |
| ---------------------- | ----------------------------------------------------------- |
| **Today's Objectives** | Homepage — shows wells with daily load targets and progress |
| **Dispatch Desk**      | Your main workspace — view loads, validate, edit, duplicate |
| **BOL Queue**          | Loads missing weight tickets (from JotForm)                 |
| **Validation**         | Review auto-matched loads and confirm accuracy              |
| **Finance**            | Payment batches and billing (admin)                         |

---

## Dispatch Desk — Your Daily Workflow

### Step 1: Pick a Date (Top Right)

The date filter is at the top of the page. Set it to the day you're working on (e.g., April 3, April 4).

- **With a date set:** Well cards show load counts for THAT day only. Loads for that day appear below the well cards across all wells.
- **Clear the date:** Shows all-time data.

### Step 2: Pick a Well

Click a well card to drill into its loads. The card shows:

- **Total loads** for the selected date
- **Ready** count (green) — loads ready for dispatch
- **Assigned** count (purple) — loads assigned to a dispatcher
- **Progress bar** — if daily targets are set, shows % complete

### Step 3: Work Through Loads

Each load row shows:

- **Status badge** — Validated (green), Pending (purple), Missing Ticket (red)
- **Load #, Driver, Carrier, Weight, BOL, Ticket, Date**
- **BOL verification icon** — Green checkmark = BOL last-4 digits match JotForm. Red warning = mismatch.
- **Colored left border** — shows which dispatcher is assigned

### Step 4: Expand a Load

Click any load row to expand it. The expanded view shows:

- **Editable fields** — click any field to edit: Driver, Truck, Trailer, Carrier, Weight, BOL, Ticket, Rate, Mileage, Delivered Date
- **BOL photo** — click the image to view full-screen
- **Timeline** — Assigned, Accepted, Pickup, Load Out, Transit, ETA, Arrival, Delivered
- **Load/Unload Duration** — time at terminal and destination
- **Weight Detail** — gross, net, tare weights in lbs
- **Financial** — Line Haul, FSC, Total, Customer Rate
- **Demurrage** — loader and destination demurrage with hours/minutes (amber section, when data exists)
- **Load Calculator** — Rate x Weight estimate with $/mile
- **References** — Order #, Invoice #, PO #, Ref #, Shipper BOL, Settlement Date, Loader, Job
- **Dispatcher Notes** — notes from PropX
- **Copy All** — copies all load info to clipboard for pasting into PCS
- **Duplicate** — clone a load N times (for batch building)

### Step 5: Validate

- **Single validate:** Click the green "Validate" button on a load row
- **Bulk validate:** Check multiple load checkboxes, then click "Validate Selected (N)"
- **Keyboard shortcut:** Shift+V to validate selected loads

### Step 6: Batch Date

When you have loads selected:

1. Pick a date in the batch date picker
2. Click "Apply Date" — sets the delivered date on all selected loads at once

---

## Pinned Well Tabs

When you click into a well, it gets "pinned" as a tab at the top. Each tab shows:

- **Well name**
- **Load count** (e.g., 14/30)
- **Mini progress bar**

Click between tabs to switch wells without losing context. Click the X to unpin.

---

## BOL Verification

The system automatically matches JotForm photo submissions to loads by BOL number:

- **Green checkmark** next to BOL = last 4 digits match between load and JotForm
- **Red warning** = mismatch — needs manual review
- **"BOL issues" filter tab** — click to see only loads with mismatches

In the expanded view, you'll see the full match detail: "BOL last-4 match" or "JotForm: ...XXXX" showing what didn't match.

---

## Filter Tabs

Above the load list, filter tabs let you focus:

| Tab          | Shows                           |
| ------------ | ------------------------------- |
| All          | Everything                      |
| Pending      | Loads not yet assigned          |
| Assigned     | Loads assigned to a dispatcher  |
| Reconciled   | Loads reconciled (pre-dispatch) |
| Ready        | Loads ready for PCS dispatch    |
| Validated    | Loads you've confirmed          |
| BOL Mismatch | Loads with BOL number issues    |

The right side shows quick counts: validated, ready, pending, BOL issues.

---

## Giving Us Feedback

**There is a purple feedback button in the bottom-right corner of every page.**

1. Click the purple circle with the speech bubble icon
2. A panel opens — it automatically captures a screenshot of your screen
3. Choose a category: **Issue** (something broken), **Question**, or **Suggestion**
4. Type a description of what you're seeing
5. Click **Submit**

This sends us:

- Your screenshot
- What page you were on
- What you clicked before the issue (breadcrumb trail)
- Your browser info

**This is the fastest way to reach us.** We get the full context of what you were looking at.

You can also text/email Jace directly.

---

## What's Live Now vs. What's Coming

### Live Now (use it today)

- View and filter loads by well + date
- Edit any load field (driver, truck, rate, BOL, etc.)
- Validate loads (single + bulk)
- Duplicate loads in batches
- Set dates on multiple loads at once
- Daily target progress tracking (Today's Objectives)
- BOL photo viewing and verification
- Copy load data to clipboard for PCS entry
- Demurrage display (when PropX has the data)
- Financial detail (Line Haul, FSC, totals)
- Timeline tracking (pickup, transit, arrival times)
- Multi-well pinned tabs
- Load count and progress on well tabs
- Feedback widget with screenshot capture
- Presence indicators (see who's working on which well)

### Coming Soon (waiting on PCS OAuth keys from Kyle)

- **Auto-dispatch to PCS** — one-click send loads to PCS instead of copy/paste
- **Auto-upload BOL photos to PCS** — photos go directly into PCS attachments
- **Full PCS field mapping** — rate types, driver first/last name parsing, carrier SCAC codes, time windows

### Coming Soon (next development phase)

- Date conflict highlighter (auto-flag mismatched dates)
- Visual dispatch pipeline (Kanban view of load stages)
- Bulk import validation from Google Sheets
- Training mode hints for new dispatchers

---

## Tips

- **Tab to save** — when editing a field in the expanded view, press Tab or click away to save automatically
- **Use the date filter first** — set your date before picking a well so you see the right day's data
- **Check BOL issues daily** — the BOL mismatch filter catches data problems early
- **Pin your wells** — click into wells you switch between often, they stay as tabs

---

## Need Help?

1. **Feedback button** (purple circle, bottom-right) — fastest way, includes screenshot
2. **Text/email Jace** — for anything urgent
3. **This document** — bookmark it for reference
