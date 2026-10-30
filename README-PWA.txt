# SecureStep PWA update

## Files
- `manifest.webmanifest`: install metadata and PNG app icons.
- `sw.js`: root-scoped service worker. It caches only `offline.html`.
- `offline.html`: offline notice; it does not pretend SOS/navigation work offline.
- `js/pwa-register.js`: registers the service worker.
- `icons/`: app icons based on the supplied SecureStep shield/keyhole artwork.
- `apply-pwa.js`: adds the manifest and registration script to root-level HTML pages.

## Apply to the Git branch
1. Download/extract this ZIP.
2. Copy its contents into the root of your cloned `major-project1` repository, preserving folders.
3. Run `node apply-pwa.js` from the repository root.
4. Review the changed HTML files, then run `git status` and inspect the diff.
5. Commit and push to `feature/securestep-pwa`, not `main`.
6. Open a pull request from `feature/securestep-pwa` into `main`.

## Safety
The service worker does not cache dashboard HTML, API responses, PHP endpoints, JSON/CSV/KML/PDF data, login, user, location, database, or SOS traffic. Offline mode is only an informational fallback. Test all live features over HTTPS before relying on the app.

The project uses root-relative URLs and is hosted at the domain root on Render. If deployment is later moved under a subpath, revise the manifest and service-worker scope.
