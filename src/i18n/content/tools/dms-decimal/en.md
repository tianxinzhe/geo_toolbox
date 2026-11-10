---
title: 'DMS to Decimal Degrees Converter — Lat/Lon Formats | GeoToolbox'
description: 'Convert latitude and longitude between decimal degrees, degrees-minutes and DMS. Auto-detects the input format and flags any carry-over. Runs entirely in your browser.'
updated: 2026-11-08
faq:
  - q: 'Is 39.54 decimal degrees, or 39 degrees 54 minutes?'
    a: 'On its own the string is genuinely ambiguous, and both readings fall inside the valid range. This tool treats it as decimal degrees (39.54) by default and then shows the degrees-and-minutes reading (39 degrees 54 minutes, which is 39.9) underneath so you can confirm which one you meant. Your input is never silently rewritten. To remove the ambiguity entirely, write the structure explicitly, for example 39°54′ or 39.54N.'
  - q: 'Why did my 39°54′90″ come out as 39°55′30″?'
    a: 'Because seconds cannot be 60 or more. The tool performed carry-over normalisation, turning 90 seconds into 1 minute 30 seconds. Both notations describe exactly the same point, 39.925 degrees. Normalisation is never silent: the result area states that the seconds value was 60 or more and has been carried into minutes, so you can go back and check whether the source figure was a typo.'
  - q: 'Where does the minus sign go for west longitudes and south latitudes?'
    a: 'On the degrees only. Minutes and seconds are always non-negative. So −116.3974 degrees is the same as 116°23′50.64″W, and writing the minus across all three parts is a mistake. When a W or S symbol is present the tool takes the absolute value first and then applies the negative sign, which means W−0.1276 and W0.1276 produce the same result instead of cancelling each other out.'
  - q: 'Why do west longitudes smaller than one degree go wrong so often?'
    a: 'Take the Royal Observatory at Greenwich: 0°7′39.36″W. The degrees part is zero, so there is nowhere to put a minus sign. An implementation that reads the sign from the degrees alone returns +0.1276 instead of −0.1276 — the magnitude is right and the direction is flipped, which puts the point on the wrong side of the prime meridian. This tool gives the hemisphere symbol priority over the sign of the degrees, so those coordinates keep their direction.'
  - q: 'Which format should I store in my database?'
    a: 'Decimal degrees. It is a single number, so it can be compared, sorted, indexed and used in calculations without splitting into three columns, and it has no carry-over edge cases at 60. Degrees-minutes and degrees-minutes-seconds are presentation formats for people, paper maps and report tables; use the copy buttons in the result area whenever you need one.'
---

## Where each of the three formats shows up

The same point can be written three ways. All three describe an identical location; they differ only in how the fractional part is subdivided.

| Format | Example | Typical source |
|---|---|---|
| Decimal degrees (DD) | `116.3974` | GPS chips, GeoJSON, databases, web APIs |
| Degrees & decimal minutes (DM) | `116°23.8440'` | Nautical and aeronautical charts, many handheld GPS screens |
| Degrees, minutes & seconds (DMS) | `116°23'50.64"E` | Printed topographic map margins, survey records, reference works |

Decimal degrees is the **computational** format: one number that can be added, compared, sorted and fed straight into a projection. DMS is the **reading** format: map margin annotations, boundary monument tables and gazetteers almost always use it. DM sits in between, and maritime and aviation practice still reports positions in degrees and minutes because one arcminute is very close to one nautical mile, which makes mental distance arithmetic easy.

The real job of this tool is therefore not arithmetic but **bridging**: the DMS figure you copied off a paper sheet has to become a decimal number before it can enter a database, and the decimal number your API returned has to become DMS before it can go into a report.

## Sign convention: west and south are negative

This is where tools disagree with each other most often, so the convention used here is stated explicitly.

- **West longitudes and south latitudes are negative.** East and north are positive.
- The minus sign lives **on the degrees only**; minutes and seconds are always non-negative. `-116°23'50.64"` is wrong. Write `116°23'50.64"W`, or `-116.3974` in decimal form.
- When a W or S symbol is present the value is **made absolute first and then negated**. `W-0.1276`, `W0.1276` and `-0.1276W` are therefore all equivalent, and a stray minus never cancels the hemisphere symbol.

That last rule has a subtle trap: **west longitudes and south latitudes smaller than one degree**. The Royal Observatory at Greenwich sits at `0°7'39.36"W`. The degrees part is zero, so there is nowhere for a minus sign to go. An implementation that infers direction from the sign of the degrees alone will return `+0.1276` — the right magnitude on the wrong side of the prime meridian. These coordinates are not rare: Quito, Libreville, and every location within one degree west of Greenwich falls into the same category. Here the **hemisphere symbol takes priority over the sign of the degrees**, and the sign is only consulted when no symbol was written at all.

One more detail: zero itself has no direction. On the equator and on the prime meridian, writing `N` or `S` would be wrong, so no hemisphere symbol is emitted for an exact zero.

## Carry-over normalisation when seconds or minutes reach 60

In a well-formed DMS value, minutes and seconds both lie in the half-open interval from 0 (inclusive) to 60 (exclusive). Real data violates this constantly: hand-summed angles, spreadsheet fill handles and raw device counters all produce things like `39°54'90"` or `39°75'0"`.

The behaviour here is to **normalise by carrying over**, and to **say so**:

- Seconds of 60 or more carry into minutes, so `39°54'90"` becomes `39°55'30"`. Both are 39.925 degrees.
- Minutes of 60 or more carry into degrees, so `39°75'0"` becomes `40°15'0"`. Both are 40.25 degrees.
- Carrying seconds can push minutes to 60, which then carries into degrees. The loop continues until all three parts are legal.

The notice matters. Normalisation is, in effect, a rewrite of what the user typed, and if it happens silently the result will not match the source record and the user will have no idea where the discrepancy came from. Whenever a carry occurs, a line appears in the result area stating whether it was seconds or minutes that carried.

## How the `39.54` ambiguity is resolved

`39.54` admits two entirely reasonable readings:

- **Decimal degrees**: 39.54 degrees.
- **Degrees and minutes**: 39 degrees 54 minutes, which is 39.9 degrees.

The gap is 0.36 degrees, roughly 40 km on the ground — enough to move a point from one city to another. Any tool facing this has two options: guess, or show both.

This tool shows both, under these rules:

1. **Decimal degrees wins by default.** Bare numbers arriving from an API, a CSV export or a database are overwhelmingly decimal degrees.
2. **The alternative reading is displayed underneath** with its own value, so you can confirm.
3. **Nothing is rewritten silently.** The chosen interpretation appears on the "read as" line, and the alternative follows immediately after it.

The ambiguity notice only fires under narrow conditions: the input is a single bare number, it has a fractional part, that fraction is at most two digits and below 60, and the degrees-and-minutes reading still lands inside the valid range. So `39` does not trigger it (an integer has no second reading), `89.99` does not either (99 minutes is illegal and the result would exceed the latitude range), and `39°32.4` certainly does not, because writing a separator already declares the format.

To avoid the question altogether, make the structure explicit in your input: `39°54'`, `39 54`, `39.54N` and `N39.54` all have exactly one reading.

## The two DMS spellings and when to use each

Every DMS result is given on two lines.

- **Symbolic**: `39°54'31.68"N`. The three parts are separated by `°`, `'` and `"`, with the hemisphere letter at the end. This is the internationally common form — map margins, journal articles, GPS screens — and it pastes cleanly into most GIS software.
- **Spelled out**: the local-language words for degrees, minutes and seconds, with the direction written as a word rather than a letter. On the Chinese page this reads as a full sentence-like string. It is meant for body text, reports and documentation, and above all for speech output and screen readers, which frequently swallow or mispronounce `°` and `"`.

The English spelled-out form still uses symbols with spaces and a trailing direction letter (`39° 54' 31.68" N`), because English has no single-character words for these units. The Japanese form uses the Japanese glyph variants for "latitude" and "longitude", which are distinct characters from the simplified Chinese ones.

## Input mistakes worth checking for

A few inputs either fail or produce something other than what you expected:

- **Latitude of 95.** Latitude is valid from −90 to +90, longitude from −180 to +180. The error names the offending field and suggests checking whether the two were transposed, which is the cause in the overwhelming majority of cases.
- **`E116.3974` typed into the latitude field.** A hemisphere symbol that contradicts the axis is not quietly ignored; the input is reported as unreadable. Ignoring it would let a swapped pair of fields pass unnoticed.
- **Negative DMS with no hemisphere symbol.** `-39°54'31.68"` is fine and means south. `39°54'31.68"` carries no direction information at all, so it is taken as positive, that is, north. Direction has to be stated.
- **Comma as a decimal separator** (`116,3974`). By default the comma is a field separator, so this reads as 116 degrees 3974 minutes and fails the range check. Switch "meaning of commas" to "decimal point" under advanced options.
- **Full-width digits and punctuation**, common when pasting from a Japanese input method or from a PDF. The input is normalised to half-width before the format is recognised, so these parse correctly.
- **Curly quotes.** Word processors turn `'` into `’` and `"` into `”`. Both variants are accepted as minute and second marks.

## Precision: how many decimal places to keep

The decimal-places option applies to the fractional part of all three formats. The ground resolution each setting buys you is shown below, measured along a meridian; for longitude, multiply by the cosine of the latitude, about 0.77 at 40°.

| Decimal degrees | Ground resolution | Seconds digits | Ground resolution |
|---|---|---|---|
| 2 | 1.1 km | whole seconds | 31 m |
| 4 | 11 m | 2 (0.01″) | 0.31 m |
| 6 | 0.11 m | 3 (0.001″) | 3.1 cm |
| 8 (default) | 1.1 mm | 4 | 3.1 mm |

Three practical recommendations. **Store and exchange decimal degrees at eight places.** That is this site's default, roughly a millimetre, which is far finer than any consumer GPS actually achieves (typically two to five metres), so it never becomes the limiting factor and never accumulates rounding error across repeated conversions. **Do not display more than two seconds digits** unless your data comes from geodetic-grade GNSS processing; quoting a coordinate to three millimetres when the measurement is accurate to three metres is misleading. **Never write the display format back into storage.** DMS has carry boundaries, and repeated cycles of formatting, copying and re-parsing introduce rounding. Keep decimal degrees in the database and format only at presentation time.

## Where to go next

If you need more than a format change: datum equivalence checks between WGS84 and CGCS2000 belong in the coordinate system converter; projected coordinates go to the EPSG converter; and short string encodings are GeoHash.

Every calculation runs locally in your browser. The coordinates you type never leave your device.

## Frequently asked questions

### Is 39.54 decimal degrees, or 39 degrees 54 minutes?

On its own the string is genuinely ambiguous, and both readings fall inside the valid range. This tool treats it as decimal degrees (39.54) by default and then shows the degrees-and-minutes reading (39 degrees 54 minutes, which is 39.9) underneath so you can confirm which one you meant. Your input is never silently rewritten. To remove the ambiguity entirely, write the structure explicitly, for example `39°54'` or `39.54N`.

### Why did my 39°54'90" come out as 39°55'30"?

Because seconds cannot be 60 or more. The tool performed carry-over normalisation, turning 90 seconds into 1 minute 30 seconds. Both notations describe exactly the same point, 39.925 degrees. Normalisation is never silent: the result area states that the seconds value was 60 or more and has been carried into minutes, so you can go back and check whether the source figure was a typo.

### Where does the minus sign go for west longitudes and south latitudes?

On the degrees only. Minutes and seconds are always non-negative. So `-116.3974` degrees is the same as `116°23'50.64"W`, and writing the minus across all three parts is a mistake. When a W or S symbol is present the tool takes the absolute value first and then applies the negative sign, which means `W-0.1276` and `W0.1276` produce the same result instead of cancelling each other out.

### Why do west longitudes smaller than one degree go wrong so often?

Take the Royal Observatory at Greenwich: `0°7'39.36"W`. The degrees part is zero, so there is nowhere to put a minus sign. An implementation that reads the sign from the degrees alone returns `+0.1276` instead of `-0.1276` — the magnitude is right and the direction is flipped. This tool gives the hemisphere symbol priority over the sign of the degrees, so those coordinates keep their direction.

### Which format should I store in my database?

Decimal degrees. It is a single number, so it can be compared, sorted, indexed and used in calculations without splitting into three columns, and it has no carry-over edge cases at 60. Degrees-minutes and degrees-minutes-seconds are presentation formats for people, paper maps and report tables; use the copy buttons in the result area whenever you need one.
