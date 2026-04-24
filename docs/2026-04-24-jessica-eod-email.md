# Email Draft — Friday 2026-04-24 EOD to Jessica

**To:** Jessica Coon <jess@esexpressllc.com>
**Cc:** Mike Coon <mike@esexpressllc.com>, Jeri (if appropriate)
**From:** jryan@lexcom.com
**Subject:** ES Express v2 — open for validation + Monday time?
**Attachments:**

- `2026-04-24-esexpress-validation-numbers.pdf` (numbers you can verify against your own PCS)
- `2026-04-27-mike-onepager.pdf` (Round 4 ROI summary for Mike)

---

Jessica,

The system is open for your validation. Login at **app.esexpressllc.com** with your `jess@esexpressllc.com` email — password is in a separate message. (Access is gated to just you and me right now so the team doesn't see anything mid-flight; if you want me to add anyone else, just say.)

**On first login, you'll land on a "What's New" tour** that walks through every change since you last saw the system, with the "why" tied to your own Apr 15 words and a click-through to each surface. Skip it if you'd rather dive straight in; it lives in the sidebar after that, accessible any time.

**The numbers you can verify yourself** are in the attached PDF. Every figure was queried against the production database this afternoon — they're inventory, not promises. Anything that doesn't match what you see in your own tools, reply and I'll dig in same-day.

**End-to-end PCS push is proven.** Earlier this week we pushed a load from v2 through the full pipeline into PCS — load **357468** was created, the BOL photo attached, and then voided cleanly. You can still see the activity in both systems; the data flow from v2 → PCS works. We hit a 500 from PCS's AddLoad endpoint on three follow-up attempts on the ES Express side, captured the wire payload, and have it with Kyle for App Insights lookup. Bottom line: the pipeline is operational, the toggle stays off until Kyle's signal comes back.

**This weekend:** poke at it. Walk through a real day's loads. Tell me where it confuses you, where it's missing something, where it gives you a number that disagrees with yours. The Monday meeting should be your observations, not my pitch.

**Two smaller things still in flight, honest:**

- **Inline photo-match** on the Validate page — today the "Awaiting Photo Match" card sends you to BOL Center; Monday it'll happen inline so you don't switch pages.
- **Smaller polish items** on Workbench consistency. Not blocking the weekend.

**Monday meeting — what time works for you?** I held 10 AM CDT loosely on my side but didn't want to pin you in. Reply with whatever works between 9 AM and 4 PM CDT and I'll get it on the calendar.

Thanks for hanging in.

Jace

---

**Postscript for Mike:** the attached one-pager summarizes Round 4 ROI in plain numbers. Happy to take any questions on the value-vs-cost framing whenever works.
