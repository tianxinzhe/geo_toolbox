---
title: 'Contact | GeoToolbox'
description: 'How to contact GeoToolbox: report a wrong calculation, suggest a tool, ask about the privacy policy or point out an error in the documentation. Includes what to include in a bug report.'
updated: 2026-11-07
---

## When it is worth contacting us

This site has no comment section and no user accounts, so this page is the only direct channel. The following kinds of feedback are the most useful to us, ordered by how quickly they get handled:

| Priority | Type | Detail |
|---|---|---|
| **Highest** | **A wrong calculation** | A tool produced a result that disagrees with a value you know to be correct. This is the most serious class of problem on this site — a wrong number does far more damage than a missing feature |
| High | Factual error in the documentation | An algorithm description, reference value, precision claim or translated term is wrong |
| High | Privacy or policy question | Anything about data handling, cookie use or advertising |
| Medium | Feature request | A tool, file format or coordinate system you would like supported |
| Medium | Usability problem | Something is hard to find, some wording is confusing, a mobile layout is broken |
| Low | Everything else | Partnerships, republication, link exchanges |

## What to include when reporting a calculation error

Calculation bugs are easy to report in a way that cannot be reproduced. Please include as much of this as you can:

1. **The tool name or page URL** — the ten tools behave differently, and a URL pinpoints it exactly
2. **The complete input values** — paste them verbatim, do not round. Precision problems often live in the last digit
3. **The value you expected, and where it came from** — another tool, a field measurement, a published dataset? The source changes how we evaluate the discrepancy
4. **The language version and browser you used** — a small number of issues relate to locale-specific formatting or to one browser's implementation
5. **For coordinate system conversion** — state the source and target systems (for example WGS84, CGCS2000 or an EPSG code) and the approximate magnitude of the coordinates

One reproducible example is worth more than ten paragraphs of description.

## What we cannot do

To avoid wasting your time and ours, there are several requests this site cannot fulfil:

- **Processing data on your behalf** — there is no backend, so we cannot receive files or run jobs. All computation has to happen in your browser. For large datasets, use a tool's batch mode and run it locally
- **Providing legally binding survey output** — cadastral work, land registration and construction setting-out require certified tooling and a qualified workflow. This site issues no certification of any kind
- **Answering general programming questions** — the focus here is geospatial computation
- **Reviewing whether your coordinates are classified or restricted** — determining data sensitivity and regulatory compliance is the user's responsibility

## Response times

This is a side project with no support team, so no response-time guarantee is possible. In practice:

- **Wrong calculations** are handled first, usually with a reply or a fix within a few days
- **Everything else** is processed in the order it arrives and may take longer
- **Feature requests** are recorded in a backlog. There is no commitment to implement them, and not every one gets an individual reply

If your report concerns a security issue — for example, an input that causes data to leak — please say so in the subject line and it will be treated as urgent.

## Reusing content

Documentation from this site may be republished provided the source is credited and a link back to the original page is included. The tools themselves are static pages built on an open-source stack, and you are welcome to deploy your own copy locally — but note that use of coordinate system and projection algorithms must comply with local regulations.
