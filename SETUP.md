# Math Garden: setup guide

This takes about 20 minutes, one time. You'll create two free accounts:

- **Supabase** holds the shared database: players, settings, scores and the error log.
- **GitHub Pages** hosts the website your kids open on their iPads.

> **Try it first (optional):** unzip the folder on your laptop and open `parent.html` in Chrome or Edge. It runs in *demo mode*, which saves data in that browser only. Add a couple of players, then open `index.html` and play.

---

## 1. Supabase (the database)

1. Go to **supabase.com** and click **Start your project**. Signing in with GitHub is easiest, so you may want to do step 2.1 first.
2. Click **New project**:
   - Name: `math-garden`
   - Database password: let your password manager generate one and save it. You probably won't need it again.
   - Region: **East US**
   - Click **Create new project** and wait about 2 minutes.
3. In the left sidebar, open **SQL Editor** and click **New query**. Paste the entire contents of `schema.sql` and click **Run**. You should see "Success. No rows returned."
4. Create your parent login:
   - Go to **Authentication → Users → Add user → Create new user**.
   - Enter your email and a password, and tick **Auto Confirm User**.
   - Then go to **Authentication → Sign In / Providers** (it may be under *Settings*) and turn **off** "Allow new users to sign up". That way you're the only account that can ever exist.
5. Get your two connection values from **Project Settings → API Keys**, or by clicking the **Connect** button at the top of the project:
   - **Project URL**, which looks like `https://abcdefgh.supabase.co`
   - **Publishable key** (`sb_publishable_…`). In older projects this is called the **anon public** key.
   - ⚠️ Never use the **secret** or **service_role** key. Only the publishable/anon key belongs in the website.
6. Open `config.js` in any text editor and paste both values between the quotes:
   ```js
   SUPABASE_URL: "https://abcdefgh.supabase.co",
   SUPABASE_KEY: "sb_publishable_xxxxxxxx",
   ```

## 2. GitHub Pages (the website)

1. Go to **github.com** and sign up for a free account. Your username becomes part of the URL, for example `castellanos-family.github.io`.
2. Click **+ → New repository**:
   - Name: `math-garden`
   - Choose **Public**. Free GitHub Pages requires a public repository. Only the code is public; no kid data lives there.
   - Click **Create repository**.
3. On the new repository page, click **uploading an existing file**. Drag in **all the files inside the folder** (not the folder itself), including your edited `config.js`. Then click **Commit changes**.
4. Go to **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, Branch to **main**, and folder to **/ (root)**, then click **Save**.
5. After 1–2 minutes your site is live at:
   - Kids: `https://YOUR-USERNAME.github.io/math-garden/`
   - Parent: `https://YOUR-USERNAME.github.io/math-garden/parent.html`

## 3. First run

1. On your laptop, open the **parent** URL and sign in. Go to **⚙️ Players** and add each kid with their name, avatar and color.
2. Click each kid's tab and pick a starting level. Good starting points: **Seedling** or **Sprout** for your 5-year-old, **Bud** for your 7-year-old. Adjust from there.
3. On each iPad:
   - Open the **kids** URL in Safari and tap that child's tile. The iPad remembers the choice from then on.
   - Tap **Share → Add to Home Screen**. The app then opens full screen, like a regular app.
   - Turn the volume up so the spoken prompts are audible. On some iPads the side mute switch silences web audio.

## Updating later

- **Settings** (levels, daily limits, race mode) are changed in the parent dashboard. No code changes needed.
- **New features:** when I send you updated files, upload them to the same GitHub repository the same way (**Add file → Upload files**). Re-run `schema.sql` only if I say the database changed.

## Good to know

- **Privacy:** only first names, avatars and game results are stored. The kids' devices can add results but can't read detailed history; only your login can. Someone who found your URL could see the player names and could add fake scores. That's acceptable for a family app, but use nicknames if you'd prefer.
- **Offline:** if an iPad loses Wi-Fi mid-game, results are kept on the device and uploaded the next time the app opens.
- **Free-tier pause:** Supabase pauses free projects after about a week with no activity. If the kids take a long break and the app stops loading, open supabase.com and click **Restore project**.
