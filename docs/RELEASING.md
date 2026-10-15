# Releasing Linemark

Releases go to the Chrome Web Store and Microsoft Edge Add-ons from GitHub Actions ([.github/workflows/release.yml](../.github/workflows/release.yml)). Pushing a version tag runs the tests, builds `dist/chrome-<version>.zip` and `dist/edge-<version>.zip` (the same files), attaches both to a GitHub Release, and submits each to its store for review.

The APIs only update the extension package. Store listing text, screenshots and promo tiles are changed by hand in each dashboard (`store/LISTING.md` and `store/EDGE.md` hold the current copy).

## Releasing a version

1. Bump `"version"` in `manifest.json` (both stores refuse a version they've already seen) and commit.
2. Tag the commit with a short note of what changed. Edge shows it to its certification testers, and it becomes the GitHub Release's notes:

   ```bash
   git tag -a v1.4.2 -m "Station names on the map no longer cross"
   git push origin main v1.4.2
   ```

3. Watch the **Release** run in the repository's **Actions** tab. Each store's review then takes its usual time.

To try a release without submitting, run the workflow by hand (**Actions → Release → Run workflow**) with **dry run** ticked: it runs the tests and builds the zips, then checks the settings without calling the stores. Locally, `node tools/publish.mjs --dry-run` does the same check.

## One-time setup

The workflow reads its credentials from a GitHub **environment** called `stores` (**Settings → Environments → New environment**). Add these as environment secrets. Optionally add yourself as a required reviewer, so every release waits for your approval before anything is submitted.

### Chrome Web Store (API v2, service account)

1. In the [Google Cloud console](https://console.cloud.google.com/), in the project you use for Linemark, enable the **Chrome Web Store API**.
2. Under **IAM & Admin → Service accounts**, create a service account (no roles needed), then **Keys → Add key → JSON**. A key file downloads.
3. In the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), open **Account** and add the service account's email address. A publisher can have one service account.
4. Note your **Publisher ID** from **Publisher → Settings**.
5. Add the secrets:
   - `CWS_SERVICE_ACCOUNT_JSON`: the whole text of the key file.
   - `CWS_PUBLISHER_ID`: the publisher ID.

   Then delete the key file from your computer. It is a password for publishing.

The API can only publish with the visibility last set in the dashboard: if you change visibility (for example Unlisted to Public), publish once by hand first. References: [Use the Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api), [service accounts](https://developer.chrome.com/docs/webstore/service-accounts).

### Microsoft Edge Add-ons (API v1.1)

1. In [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/), open **Microsoft Edge → Publish API**, enable the new experience if asked, and click **Create API credentials**.
2. Note the **Client ID** and the **API key** (the key is shown once).
3. Open Linemark's **Extension overview** and copy the **Product ID** from **Extension identity** (a GUID, not the Store ID).
4. Add the secrets `EDGE_CLIENT_ID`, `EDGE_API_KEY` and `EDGE_PRODUCT_ID`.

**Edge API keys expire every 72 days.** Create a new key on the same page before then and replace `EDGE_API_KEY`; a release with an expired key fails at the Edge step with an authorisation error, and Chrome is unaffected. Reference: [Edge Add-ons REST API](https://learn.microsoft.com/en-us/Microsoft-Edge/extensions/update/api/using-addons-api).

## If a step fails

- **Version already exists / not increased:** bump `manifest.json` and tag again.
- **Edge: a submission is already in review:** wait for it to finish, then re-run the job.
- **Chrome: publish refused after a visibility change:** publish once by hand in the dashboard, then re-run.
- **Uploaded, but submitting failed:** the store already holds that version, so a re-run's upload is refused. Submit the uploaded draft by hand in that store's dashboard, or bump the version and tag again. Re-running never publishes a version twice.
