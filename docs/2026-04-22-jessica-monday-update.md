# Email to Jessica — Monday maintenance window ask (send after wells email)

**To:** Jess@ESExpressllc.com
**CC:** Bryan.Janz@Lexcom.com
**Subject:** ES Express — OK to hold maintenance through Monday morning? (PCS handover is in play)

---

Jessica,

Wanted to check in before we commit to a timeline. We put the site into maintenance tonight to clean up a handful of issues that compounded on each other — the April 20 batch-clear mystery, the ~20,000 orphan loads whose wells got added after the fact, and the matcher baseline drifting because of both. Doing those fixes live would risk showing Scout and Steph half-cleaned data while we work, which is the opposite of what we want.

The cleanest window to finish everything and re-baseline the matcher is through Monday morning. Wanted to confirm that works for you before we hold it.

There's a second reason to take the window: if we push to Monday, there's a strong likelihood (pending final testing this weekend) that the site comes back with the **PCS push integration fully validated and wired up**. Your `Validate` button becomes `Push to PCS` with no further deploy needed — it's controlled by a toggle on the Settings page that's OFF by default. When the site reopens Monday, that toggle is yours to flip whenever you and the team decide you're ready. We're not picking a go-live date for PCS — that call is yours. What we want is for "we're ready whenever you are" to be true on Monday morning rather than "we're still working on it."

Here's what you'll see when the site opens back up:

- The ~20,000 orphan loads come back on Load Center under the correct well, plus whatever closes out from the wells-ask email I sent alongside this one.
- Every clearing event now has an audit trail — who did it and when — so the April 20 batch-clear is attributed to "system backfill" instead of looking like a mystery user action.
- BOL vocabulary unified across every page: the paper ticket number is labeled "BOL" consistently, the Logistiq system code is hidden by default.
- The matcher is re-baselined — every load re-scored under the current rules — so the Matcher % badge on the home page reflects a clean starting line.
- The redundant "Mine" filter tab is gone, and terminal loads show "Completed" instead of "Entered."
- New inline-editable fields on the Wells admin page: rate per ton, FFC, FSC, mileage, customer, loader — so rate owners live at the well level instead of per-ticket.
- Sign-in improved: magic-link email option on the login page, old password flow still works.
- **PCS push ready to flip on** — toggle is on the Settings page, OFF by default, your decision when to enable it. Once on, validated loads push directly to PCS instead of requiring the double-entry step.

If Monday morning is a problem — say, you need eyes on the system before then for any reason — let me know and we'll adjust the scope or shorten the window. I'd rather you have what you need than hold the window rigidly.

**One ask alongside this — Google Sheets service account share (one-time, production):**

Any spreadsheet your team uses in the daily process (Load Count Sheet, Jodi's payroll workbook, Jenny's reconciliation tabs, anything load-related) needs to be shared with our production Google service account so we can run sheet-to-system reconciliation going forward — the "did the system miss any loads this week?" check Jenny currently does manually.

This is a **one-time share** — the service account stays the same going forward, so you only do this once per sheet. It's the production-side identity, tied to the same Google Cloud project the photo pipeline already uses.

Please share each relevant sheet with: **esexpress-photos@pbx-59376783.iam.gserviceaccount.com** (Viewer access is fine). A short note back listing which sheets you shared helps me know the scope is complete.

Thanks,
Jace
