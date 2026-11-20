# Saturday cleaning signup

Families sign up for Saturday morning cleaning on a Google Site page. The coordinator keeps the roster in a private Google Sheet. The page and the emails do not include a church name or address.

Times are Mountain Time (`America/Denver`), including daylight saving. Google runs the scheduled emails around 9:00am, sometime during that hour.

Supplies are at the building.

## What a family does

Open the cleaning page on the Google Site.

1. Choose a Saturday that still has room. Each date shows how many of the 4 spots are left. A full Saturday is listed as full and cannot be chosen.
2. Enter the family name.
3. Enter the contact name. That is the person the Friday reminder names.
4. Choose the Friday reminder: **Email**, **Text**, or **Email and text**.
5. Enter the email address, the phone number, or both, so it matches that choice. A phone number needs an area code, such as `801-555-0100`.
6. Choose **Sign up**.

The page confirms the Saturday. The reminder goes out on Friday. To cancel, reply to that reminder or tell the coordinator. The coordinator frees the spot by deleting that row on the **Signups** tab.

The form also says who to contact if you need help signing up. That line stays on the page when no Saturday is open. It uses the coordinator’s name from **Settings** when one is entered. His phone number and email are in the LDS Tools app, not on the form.

Text reminders stay off until texting is turned on in the sheet. Until then, leave an email address if you want the Friday reminder. A text-only signup is sent to the coordinator to follow up by phone.

## What the coordinator does each week

Use the Google Sheet. Share it only with people who should edit the roster.

### Saturdays

The sheet adds upcoming Saturdays for you. Each new row starts as **Open** with **Max families** set to 4.

- Hide a Saturday from the signup page: set **Status** to `Closed`. Leave the row in place. Deleting the row keeps that date from being added again.
- Change the cap for one Saturday: edit that row’s **Max families** cell. The number on the **Settings** tab applies only to new rows.
- Add a note families should see: type it in **Notes**. It shows under that date on the signup page.
- See whether the low-signup email already went: **Low-signup notice sent**. Clear that cell to allow the Thursday check to send again. It only sends on Thursday or Friday.

### Signups

Each family is one row: Saturday, family name, contact name, email, phone, and reminder choice.

- Free a spot: delete that family’s row.
- See whether Friday’s reminder already went: **Reminder sent at**. Clear it only when you want that reminder sent again.

### Settings

- **Coordinator name.** Shown on the signup page for people who need help signing up. Leave it blank to say “the cleaning coordinator.” Do not put a phone number or email in this cell.
- **Coordinator email.** Address that receives the low-signup note. Reminder replies go here too. Fill this in before the Thursday email can send. It is not shown on the signup page.
- **Minimum families.** Default `2`. On Thursday, if the coming Saturday is still open and has fewer families than this, you get one email.
- **Max families.** Default `4`. Used when new Saturday rows are created.
- **Weeks ahead.** How many new Saturdays to keep on the schedule.
- **Texting enabled.** Leave `FALSE` until texting is set up.
- **Timezone.** Leave `America/Denver`.

Hover a setting name to read the note on that cell.

### Cleaning menu

In the sheet, open **Cleaning**.

| Menu item | When to use it |
|---|---|
| Set up sheet | Once, when the tabs do not exist yet. |
| Install reminder schedule | Once, after the coordinator email is filled in. |
| Add upcoming Saturdays | When you want dates past the latest row. |
| Check low signup now | On Thursday or Friday, to send the low-signup email if it has not been sent. |
| Send Friday reminders now | When tomorrow is Saturday and you want to send any reminders that are still blank. |

## When the emails go out

| When | Who | What |
|---|---|---|
| Thursday, around 9:00am Mountain Time | Coordinator | One email when the coming Saturday is open and has fewer than the minimum (2 unless you change it). The message lists who is signed up and links to the sheet and the signup page. |
| Friday, around 9:00am Mountain Time | Coordinator | The same note, if Thursday did not send it. |
| Friday, around 9:00am Mountain Time | Signed-up families | The reminder they chose for Saturday. |
| Friday, same run | Coordinator | A follow-up when a reminder could not be sent, or when someone asked for a text while texting is off. |

A family who signs up after Friday’s job has run does not get that week’s reminder.

## Put the signup page on the Google Site

1. In the sheet, choose **Extensions → Apps Script**.
2. Choose **Deploy → New deployment → Web app**.
3. Set **Execute as** to **Me** and **Who has access** to **Anyone**.
4. Deploy and copy the web app URL. It ends in `/exec`.
5. On the Google Site, choose **Insert → Embed → By URL**, paste that URL, and set the height to about 720 pixels.
6. Publish the site so anyone with the link can open it.

Anyone with the site link can submit the form. The script writes to the sheet as you, so visitors cannot open the sheet or see other families’ email addresses and phone numbers.

After you change the script, choose **Deploy → Manage deployments**, edit the web app, and select **New version**. The `/exec` URL stays the same, so the Site embed can keep the same link. Publish the Site again only if you changed the Site page itself. Redeploy after this noindex change so the signup page serves the updated file.

## Ask search engines not to list it

Publish the Site, then turn on Google’s search opt-out. On a computer, open the site in Google Sites. At the top, next to **Publish**, click the **Down arrow**. Click **Publish settings**. Click **Request public search engines to not display my site**. Click **Save**. Families who have the link can still open the published site.

That setting applies to the Google Site. The signup form is a second address, the Apps Script web app URL on `script.google.com` that ends in `/exec`. That page now includes `<meta name="robots" content="noindex, nofollow">`, which asks crawlers not to index the form. The meta tag does not opt the Google Site itself out of search. Apps Script cannot set an `X-Robots-Tag` header, and you cannot edit `robots.txt` on `script.google.com`. Use the meta tag, and share the Site link rather than the `/exec` URL.

## First-time sheet setup

1. Create a blank Google Sheet named `Saturday cleaning`.
2. Choose **Extensions → Apps Script**.
3. Turn on **Project Settings → Show "appsscript.json" manifest file**.
4. Replace the default files with the files in `src/`:
   - `Code.js` as `Code.gs`
   - `Logic.js` as `Logic.gs`
   - `Index.html` as `Index.html`
   - `appsscript.json` with the contents of `src/appsscript.json`
5. Save, reload the spreadsheet, and run **Cleaning → Set up sheet**. Allow the requested permissions.
6. On **Settings**, enter **Coordinator name** and **Coordinator email**. The name is the only coordinator detail the signup page shows. Leave the name blank to say “the cleaning coordinator.” People are told that contact information is in the LDS Tools app.
7. Run **Cleaning → Install reminder schedule**.
8. Deploy the web app and embed it, using the steps above.

## Business website

GitHub Pages publishes the RLE Consulting page from the `docs/` folder:

- https://rellefsen.github.io/saturday-cleaning/
- Text opt-in proof: https://rellefsen.github.io/saturday-cleaning/opt-in.html
- Privacy: https://rellefsen.github.io/saturday-cleaning/privacy.html
- Terms: https://rellefsen.github.io/saturday-cleaning/terms.html

For the toll-free opt-in proof, choose the web form. People do not text a keyword. Put the text opt-in URL in the proof field.

Use that site address on the toll-free registration. The page names RLE Consulting, describes Meadowcrest Ward Reminders, and links to the privacy policy and terms. It does not list the texting number as a phone number to call.

Email for `rleconsulting.com` can stay on Namecheap. To serve this same page at `rleconsulting.com` later, leave the Namecheap `MX` records on `mx1.privateemail.com` and `mx2.privateemail.com`, and point only the website records at GitHub Pages. GitHub’s current addresses are listed in [Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

## Texting

Leave **Texting enabled** as `FALSE` until the toll-free number is verified. Until then, Friday email still goes to anyone who left an email address.

When the number is ready, open Apps Script **Project Settings → Script properties** and add:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER` (such as `+18015550100`)

Then set **Texting enabled** to `TRUE` on the Settings tab. Keep those three values in Script properties, not in the sheet.

## Optional: push script edits with clasp

```bash
cp .clasp.json.example .clasp.json
# Put the Apps Script project ID into .clasp.json
npx @google/clasp push
```

Create the script from **Extensions → Apps Script** on the sheet so it stays bound to that file. `.clasp.json` stays off git because it holds the script ID.
