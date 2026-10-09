# Optional encrypted sync

Ember is **local by default**. Sync is off until you turn it on, and every feature works the same without it.

When you turn sync on, Ember keeps your library the same across Chrome, Edge, Brave and Vivaldi on your computers:

- Everything is encrypted **on your device**, with a key made from your passphrase, before it leaves.
- It's stored in your own Google Drive's private app folder.
- Google only ever holds scrambled data.

## How it works

| | |
|---|---|
| **Where** | The hidden app-data folder of your Google Drive. Your other Drive files, and other apps, can't see it, and Ember can't see your other Drive files. It counts against your Drive storage. |
| **Encryption** | Your passphrase goes through PBKDF2-SHA256 (600,000 iterations) to make an AES-256-GCM key. Every file is encrypted with a fresh random nonce. The key is generated on this device and can't be exported. |
| **What's synced** | Lines, bookmarks (titles, notes, tags, favorites, trash), permanent deletions, and stored images (screenshots and covers). Page text for full-text search isn't synced; each device rebuilds its own index from **Settings → Health & search**. |
| **Files** | `ember-vault.json` holds the salt, iteration count and an encrypted check value, and no secrets. `ember-library.enc` is the encrypted library. Each `m-<id>.enc` is one encrypted image. |
| **Merging** | The newest edit of each line or bookmark wins. A permanent deletion removes the record on every device, unless it was edited again after being deleted. Undo counts as a fresh edit. |
| **When** | When the library opens, about 15 seconds after you stop editing, every five minutes while the library is open, and whenever you click **Sync now**. Pages saved from the popup sync the next time the library is open. |
| **Passphrase** | Ember can't recover it. If you lose it, delete the cloud copy and set sync up again; your local library is never affected. **Forget key** makes this device ask for the passphrase again. |

## Setting up your Google client ID (one time, about 5 minutes)

Ember has no server and no shared Google project, so sync uses an OAuth client that **you** own.

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a project, for example "Ember sync".
2. **APIs & Services → Library**: enable the **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - Choose **External**.
   - Fill in the app name and your email.
   - Add the scope `.../auth/drive.appdata` (Ember asks for nothing else).
   - Under **Test users**, add your own Google account.
   - You can leave the app in **Testing**; it's only for you.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorised redirect URIs**: paste the URI shown in Ember under **Settings → Sync → Set up sync**. It looks like `https://<extension-id>.chromiumapp.org/google`.
5. Copy the **client ID** (`….apps.googleusercontent.com`) into Ember, choose a passphrase, and click **Connect Google Drive and sync**.

On your other computers:
1. Load Ember.
2. Add that computer's redirect URI to the same OAuth client (step 4); each install of an unpacked extension has its own ID.
3. Enter the same client ID and passphrase.

### Good to know

- **Testing mode:** while your consent screen is in Testing, Google may ask you to sign in again from time to time. Sync then shows "needs attention"; clicking **Sync now** signs you back in.
- **Same extension ID everywhere:** you can add a `"key"` to `manifest.json` so every install gets the same ID and redirect URI. See Chrome's documentation on keeping a consistent extension ID.
- **Firefox and Safari** aren't supported by this prototype. The sync code uses only standard web crypto and `chrome.identity.launchWebAuthFlow`, so a Firefox port mostly needs its own manifest.

## Turning it off

- **Turn off:** stops syncing on this device and leaves the encrypted cloud copy, so your other devices keep working.
- **Delete cloud copy:** removes every Ember file from your Drive's app folder and turns sync off. Your local library stays as it is.
