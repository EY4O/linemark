# Optional encrypted sync

Linemark is **local by default**. Sync is off until you turn it on, and every feature works the same without it.

When you turn sync on, Linemark keeps your library the same across Chrome, Edge, Brave and Vivaldi on your computers:

- Everything is encrypted **on your device**, with a key made from your passphrase, before it leaves.
- It's stored in your own Google Drive's private app folder.
- Google only ever holds scrambled data.

## How it works

| | |
|---|---|
| **Where** | The hidden app-data folder of your Google Drive. Your other Drive files, and other apps, can't see it, and Linemark can't see your other Drive files. It counts against your Drive storage. |
| **Encryption** | Your passphrase goes through PBKDF2-SHA256 (600,000 iterations) to make an AES-256-GCM key. Every file is encrypted with a fresh random nonce. The key is generated on this device and can't be exported. |
| **What's synced** | Lines, bookmarks (titles, notes, tags, favorites, trash), permanent deletions, and stored images (screenshots and covers). Page text for full-text search isn't synced; each device rebuilds its own index from **Settings → Health & search**. |
| **Files** | `ember-vault.json` holds the salt, iteration count and an encrypted check value, and no secrets. `ember-library.enc` is the encrypted library. Each `m-<id>.enc` is one encrypted image. |
| **Merging** | The newest edit of each line or bookmark wins. A permanent deletion removes the record on every device, unless it was edited again after being deleted. Undo counts as a fresh edit. |
| **When** | When the library opens, about 15 seconds after you stop editing, every five minutes while the library is open, and whenever you click **Sync now**. Pages saved from the popup sync the next time the library is open. |
| **Passphrase** | Linemark can't recover it. If you lose it, delete the cloud copy and set sync up again; your local library is never affected. **Forget key** makes this device ask for the passphrase again. |

## Signing in

Sign-in has one job: it gives Linemark access to its private app folder in your Drive (the `drive.appdata` scope, nothing else). The **passphrase** is what encrypts your library, and it never leaves your device. If the key came from your Google account instead, Google, or anyone who took over the account, could unlock your data.

Linemark picks the best sign-in your browser offers:

| Browser | How you sign in |
|---|---|
| **Google Chrome** | One click with the Google account already signed into Chrome (`chrome.identity.getAuthToken`). Chrome renews access by itself. |
| **Edge, Brave, Vivaldi** | Google's sign-in window, once (`launchWebAuthFlow`). Linemark renews silently while you stay signed in to Google, and occasionally asks again. |
| **Any** | **Advanced: use your own Google project**: your own OAuth client ID, for people who'd rather not use Linemark's shared one. |

So for a user, setup is:
1. **Settings → Sync → Set up sync.**
2. Choose a passphrase.
3. Click **Sign in with Google and sync**.

On every other device, use the same Google account and the same passphrase.

## Publisher setup (one time)

Built-in sign-in needs one Google Cloud project for Linemark, owned by whoever publishes it. Until the placeholders below are filled in, Settings automatically offers **Use your own Google project** instead.

Linemark's own values:

| Setting | Value |
|---|---|
| Chrome Web Store item ID | `laapaiiaipeoilipnbhpjmjbdkomhjln` |
| Web client redirect URI | `https://laapaiiaipeoilipnbhpjmjbdkomhjln.chromiumapp.org/google` |
| Homepage | `https://linemark.eternalpose.io/` |
| Privacy policy | `https://linemark.eternalpose.io/privacy.html` |
| Consent-screen logo (120×120) | `store/images/oauth-logo-120.png` |
| Google Cloud project | `angelic-howl-511200-t5` ("Linemark", owned by iamlooneth@gmail.com) |
| Chrome Extension client | `1037985269779-s7bdmv2c3t320ng3kv0cbtmjoorfr7hl.apps.googleusercontent.com` |
| Web application client | `1037985269779-654f8q63gufp18llmbminisa7fs2mnmd.apps.googleusercontent.com` |

**Same ID when unpacked.** `manifest.json` carries the store item's public key as `"key"`, so an unpacked copy gets the store ID (`laapaiiaipeoilipnbhpjmjbdkomhjln`) and Google sign-in works there too. `node tools/package.mjs` leaves the key out of the upload. Adding the key moved unpacked installs to a new ID, so a library made before it needs **Full backup (JSON)** and **Restore**.

1. **Give Linemark a fixed extension ID.** Either publish to the Chrome Web Store, or add a `"key"` to `manifest.json` (see Chrome's docs on keeping a consistent extension ID).
   > ⚠ **Back up first.** Changing the extension ID moves Linemark to a new storage area, so the existing library seems to disappear. Use **Settings → Full backup (JSON)** before you change it, and **Restore** afterwards.
2. **Create a project** in the [Google Cloud console](https://console.cloud.google.com/) and enable the **Google Drive API**.
3. **Set up the OAuth consent screen:**
   - User type **External**.
   - Your app name, logo, support email, homepage and **privacy policy URL**.
   - Add the scope `https://www.googleapis.com/auth/drive.appdata`.
4. **Create two OAuth clients** (APIs & Services → Credentials):
   - **Chrome Extension** client, with the fixed extension ID as the item ID. Put its client ID in **`manifest.json` → `oauth2.client_id`**.
   - **Web application** client, with the authorised redirect URI `https://<extension-id>.chromiumapp.org/google`. Put its client ID in **`js/config.js` → `GOOGLE_WEB_CLIENT_ID`**.
5. **Submit for verification.** Google lists `drive.appdata` as a non-sensitive scope, so only basic (brand) verification is needed: domain ownership, privacy policy and logo. There's no security assessment. Until it's verified, users see an "unverified app" warning and you're limited to 100 test users. Google can reclassify scopes, so check the label on Google's *Choose Google Drive API scopes* page when you submit.

Linemark still runs no server. Each user's encrypted data lives in their own Drive, and the publisher never sees it.

## Using your own Google project (Advanced)

1. Create a project and enable the **Google Drive API**.
2. Set up the OAuth consent screen:
   - User type **External**.
   - Add the scope `.../auth/drive.appdata`.
   - Add yourself under **Test users**. You can leave the app in **Testing**.
3. Create an OAuth client of type **Web application**. Use the redirect URI shown in **Settings → Sync → Advanced** as its authorised redirect URI. Each install of an unpacked extension has its own ID, so add one URI per computer.
4. Paste the client ID into **Advanced: use your own Google project**, choose your passphrase, and sync.

### Good to know

- **Testing mode:** while your consent screen is in Testing, Google may ask you to sign in again from time to time. Sync then shows "needs attention"; clicking **Sync now** signs you back in.
- **Firefox and Safari** aren't supported yet. The sync code uses standard web crypto and `launchWebAuthFlow`, so a Firefox port mostly needs its own manifest.

## Turning it off

- **Turn off:** stops syncing on this device and leaves the encrypted cloud copy, so your other devices keep working.
- **Delete cloud copy:** removes every Linemark file from your Drive's app folder and turns sync off. Your local library stays as it is.
