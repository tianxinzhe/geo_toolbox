---
title: 'Privacy Policy | GeoToolbox'
description: 'GeoToolbox privacy policy: no accounts, no data collection, every calculation runs locally in your browser and file contents are never uploaded. Also covers advertising, map tiles and local storage.'
updated: 2026-11-07
---

Effective date: 7 November 2026

## The short version

**This site does not collect anything you type into it.** That is not a promise, it is a consequence of the architecture. GeoToolbox is a purely static site deployed on Cloudflare Pages. There is **no backend** — no server-side API, no database, no job queue. Coordinates you enter, text you paste and files you upload are all processed inside your own browser, and results are generated there too. The site has no technical means of receiving that data.

## What this site does not do

| Item | Detail |
|---|---|
| Accounts | No sign-up, no login, no cloud storage, no collaboration |
| Data upload | Files are parsed locally in the browser; contents are never sent to a server |
| Server sessions | None. No session, no token, no user identifier |
| Background jobs | None. All computation happens synchronously or in a local Web Worker |
| Usage history | Nothing is recorded server-side |

## Browser local storage

The site uses `localStorage` **in your own browser** to remember a few preferences, so you do not have to reconfigure them on your next visit. The only things stored are:

- Interface language
- Numeric precision setting
- Preferred units
- Expanded/collapsed state of advanced panels
- Last selected output format
- The "comma meaning" toggle used by the coordinate parser
- The current canvas contents of the map drawing tool (T09 only), so a refresh does not lose your work

None of this ever leaves your device and we cannot read it. You can clear it at any time from the "Cookie settings" link in the footer, or by clearing site data in your browser.

**GPS readings are never written to local storage.** Coordinates obtained through the "Use my location" button live only for the current page session and are destroyed when the page closes. They are not persisted in any form.

## Third-party services

### Advertising (Google AdSense)

On the **English and Japanese** versions of this site, advertising is served through Google AdSense. **The Simplified Chinese version loads no advertising script at all and reserves no ad space.**

Google, as a third-party vendor, uses cookies to serve ads, including personalised ads based on your prior visits to this site or other sites. Google's use of cookies is governed by its own privacy policy.

You can:

- Manage or opt out of personalised ads through [Google Ads Settings](https://www.google.com/settings/ads)
- Learn about third-party cookie use and opt out via [www.aboutads.info](https://www.aboutads.info/)
- Choose "Necessary only" in this site's cookie consent banner. Declining does not affect any tool — the site remains fully functional, only the advertising behaviour changes

Before you make a choice, **no personalised advertising script is loaded at all**.

### Map tiles

Map features load imagery from public tile servers. When tiles load, your browser makes a request directly to that server, which may record standard access logs (IP address, user agent, request time, tile coordinates). We do not proxy, relay or record those requests.

Mapping is **optional**: only tool pages that need a map load one, and they do so lazily. If you never expand the map area, no tile request is made. Purely numeric tools involve no map at all.

### Analytics

The site currently integrates **no** third-party analytics service. If that changes, this page will be updated to name the service, list the data collected and explain how to opt out, and the effective date will be revised.

## Specific situations you may be wondering about

**I pasted our company's land parcel boundaries. Are they exposed?**
No. Pasted text exists only in the memory of your current browser and is destroyed when the page closes. No network request carries that text anywhere — you can verify this yourself in your browser's developer tools under the Network panel.

**I uploaded a 20 MB CSV. Where did the file go?**
It was read and parsed by your browser on your machine. It was never uploaded. The practical limit on processing volume is your device's memory, not a server quota.

**Are the results I copy recorded?**
Copying to the clipboard is a local browser operation. We cannot observe it and do not record it.

**Does a shared link contain my coordinates?**
Yes, by design. The "Share link" feature encodes your current input state into URL parameters so that whoever opens the link sees the same result. **If a coordinate should stay private, do not share that link.** URL parameters are not encrypted; anyone with the link can recover the input values.

## Children

This site is not directed at children under 13 and does not knowingly collect personal information from anyone, so there is no collection of children's data to describe.

## Changes to this policy

When this policy changes we will update the effective date at the top of the page and record the change below. Material changes — for example, adding analytics for the first time — will also be announced prominently on the site.

| Date | Change |
|---|---|
| 2026-11-07 | Initial publication |

## Contact

Questions about this policy can be sent to us through the channel described on the [contact page](/en/contact/).
