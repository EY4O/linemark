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

To try a release without submitting, run the workflow by hand (**Actions → Release → Run workflow**) with **dry run** ticked: it runs the tests and builds the zips, signs in to the Chrome Web Store and reads Linemark's status there, and makes a harmless call to the Edge API to check its key is accepted, without uploading anything. Locally, `node tools/publish.mjs --dry-run` does the same check.

## One-time setup

The release job runs in a GitHub **environment** called `stores` (**Settings → Environments**), which holds the secrets below. Optionally add yourself as a required reviewer there, so every release waits for your approval before anything is submitted.

### Chrome Web Store (API v2, keyless)

Chrome needs no key. The workflow proves to Google that it is a run of EY4O/linemark in the `stores` environment ([Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)) and gets a one-hour token as a service account the Chrome Web Store accepts. This is already set up:

- **Google Cloud project** `angelic-howl-511200-t5` (number 1037985269779, owned by iamlooneth@gmail.com): the Chrome Web Store, IAM Service Account Credentials and Security Token Service APIs are on.
- **Service account** `linemark-release@angelic-howl-511200-t5.iam.gserviceaccount.com`: no keys and no project roles. Its only grant is **Workload Identity User** for the subject `repo:EY4O@25870429/linemark@1413722472:environment:stores`. GitHub writes subjects in this "immutable" form (owner and repository IDs included) for this repository, so the grant must use it too.
- **Workload identity pool** `github`, provider `linemark`: trusts GitHub's tokens only for this repository's ID and owner ID, so a fork or a new repository with the same name can't use it.
- **Chrome Web Store dashboard → Account**: the service account's email is added. A publisher can have one service account.
- **Secret** `CWS_PUBLISHER_ID` in `stores` (from **Publisher → Settings**).

The provider and service account names are in the **Sign in to the Chrome Web Store** step of the workflow. A dry run signs in and reads the item's status, so it shows whether the whole chain works without uploading anything.

The API can only publish with the visibility last set in the dashboard: if you change visibility (for example Unlisted to Public), publish once by hand first. References: [Use the Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api), [service accounts](https://developer.chrome.com/docs/webstore/service-accounts), [google-github-actions/auth](https://github.com/google-github-actions/auth).

`tools/publish.mjs` still accepts a service account's JSON key (`CWS_SERVICE_ACCOUNT_JSON`) instead of a token, for running it from your own computer.

### Microsoft Edge Add-ons (API v1.1)

1. In [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/), open **Microsoft Edge → Publish API**, enable the new experience if asked, and click **Create API credentials**.
2. Note the **Client ID** and the **API key** (the key is shown once).
3. Open Linemark's **Extension overview** and copy the **Product ID** from **Extension identity** (a GUID, not the Store ID).
4. Add the secrets `EDGE_CLIENT_ID`, `EDGE_API_KEY` and `EDGE_PRODUCT_ID`.

**Edge API keys expire every 72 days.** Create a new key on the same page before then and replace `EDGE_API_KEY`; a release with an expired key fails at the Edge step with an authorisation error, and Chrome is unaffected. Reference: [Edge Add-ons REST API](https://learn.microsoft.com/en-us/Microsoft-Edge/extensions/update/api/using-addons-api).

## If a step fails

- **Version already exists / not increased:** bump `manifest.json` and tag again.
- **Edge: a submission is already in review:** wait for it to finish, then re-run the job.
- **Chrome: sign-in fails** (`Permission 'iam.serviceAccounts.getAccessToken' denied` or `unauthorized_client`): the grant's subject must match the one GitHub sends, character for character (see `gh api repos/EY4O/linemark/actions/oidc/customization/sub`), and the job must run in the `stores` environment.
- **Chrome: 403 from the store after signing in:** the service account isn't added under **Account** in the Chrome Web Store dashboard, or `CWS_PUBLISHER_ID` is wrong.
- **Chrome: publish refused after a visibility change:** publish once by hand in the dashboard, then re-run.
- **Uploaded, but submitting failed:** the store already holds that version, so a re-run's upload is refused. Submit the uploaded draft by hand in that store's dashboard, or bump the version and tag again. Re-running never publishes a version twice.
