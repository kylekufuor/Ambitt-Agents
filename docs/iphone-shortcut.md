# Ambitt Lead Agent — iPhone Shortcut Setup

Fire a lead from your phone in under 10 seconds.

## Setup (one time)

1. Open **Shortcuts** app on your iPhone
2. Tap **+** to create new shortcut
3. Name it: **"Ambitt Lead"**

### Actions (in order):

**Action 1 — Ask for Input**
- Type: Text
- Prompt: "Describe the lead"
- This is where you dictate or type the brief

**Action 2 — Get Contents of URL**
- URL: `https://ambitt-agents-production.up.railway.app/lead`
- Method: POST
- Headers:
  - `Authorization`: `Bearer YOUR_LEAD_API_KEY`
  - `Content-Type`: `application/json`
- Request Body: JSON
  - `brief`: *Provided Input* (select the variable from Action 1)

**Action 3 — Get Dictionary Value**
- Get value for key `status` from *Contents of URL*

**Action 4 — If**
- If *Dictionary Value* **is** `sent`:
  - **Show Notification**: "✓ Email sent to prospect"
- Otherwise:
  - **Show Notification**: "⏳ Lead captured — need email"

4. Tap the shortcut name at top → **Add to Home Screen**
5. Choose an icon (⚡ works well)

## Usage

1. Meet someone at a bar
2. Tap the ⚡ shortcut on your home screen
3. Dictate: "Met Sarah Jones at Sass Café Monaco. She runs a 15-person boutique hotel. Pain point is guest communication — too manual. Email is sarah@hotel.com"
4. Done. Sarah gets a beautiful personalized email before you finish your drink.

### If you forgot their email:
- You'll get a notification: "Lead captured — need email"
- You'll also get an email with the lead details and instructions
- When you get the email, use the shortcut again or run:
  ```
  ./oracle/cli.sh lead-email <leadId> sarah@hotel.com
  ```

## Pro Tips

- **Dictation works great** — just talk naturally, Claude parses it
- **Include as much context as you can** — business type, size, pain point, location
- **The more specific the pain point, the better the email** — "guest communication is too manual" beats "needs help"
- **You can also fire from CLI:**
  ```
  ./oracle/cli.sh lead "Met Sarah Jones at Sass Café. Hotel, 15 people, guest comms too manual. sarah@hotel.com"
  ```

## Environment Variables (in Railway)

Make sure these are set on your Oracle service:
```
LEAD_API_KEY=your-secret-key-here
CALENDLY_URL=https://calendly.com/your-link
KYLE_EMAIL=kylekufuor@gmail.com
RESEND_API_KEY=already-set
ANTHROPIC_API_KEY=already-set
```
