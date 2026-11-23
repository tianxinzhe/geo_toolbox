---
title: 'GeoHash Encoder and Decoder — Coordinates & Strings | GeoToolbox'
description: 'Encode latitude and longitude into a GeoHash, or decode a GeoHash into its centre, bounding box, ground size and eight neighbours. Runs locally in your browser.'
updated: 2026-11-08
faq:
  - q: 'Why is a seven-character GeoHash often described as 150 metres?'
    a: 'Seven characters carry 35 binary bits: about 18 for longitude and 17 for latitude. Longitude divides 360 degrees into 2^18 intervals of roughly 0.00137 degrees, which is about 152 metres at the equator; latitude divides 180 degrees into 2^17 intervals of the same angular width, also about 152 metres. So the cell is roughly 150 metres across. Away from the equator the east-west width shrinks by the cosine of the latitude, making the cell narrower.'
  - q: 'Does a longer GeoHash always mean a more accurate position?'
    a: 'It means a smaller cell, not a more accurate original point. A GeoHash describes a rectangle, and decoding returns the centre of that rectangle. The true location can be anywhere inside the box. With seven characters the centre can be up to about 100 metres away from the original point, so a decoded GeoHash should never be stored as if it were an exact coordinate.'
  - q: 'Why are a, i, l and o missing from the alphabet?'
    a: 'A GeoHash needs 32 symbols to represent five binary bits. The standard uses the digits 0-9 plus the lowercase letters b c d e f g h j k m n p q r s t u v w x y z. The four omitted letters are easily confused with 1, 0 and uppercase I in small type, handwriting or low-resolution screens, so removing them cuts transcription and dictation errors. Seeing any of them means the string is not a valid GeoHash or another encoding was mixed in.'
  - q: 'What should I watch out for when using GeoHash for nearby search?'
    a: 'Pick the character length that matches your radius, fetch the centre cell and its eight neighbours, then filter every candidate with a great-circle distance. Querying only the centre cell misses points just across a cell boundary. The nine-cell square also does not cover a circle, and at high latitudes the east-west neighbour is physically narrower. For larger radii, take more rings or use a database with a real spatial index.'
  - q: 'What are GeoHashes good for in a database?'
    a: 'Points sharing a prefix sit in the same rectangle, so an ordinary B-tree index can use a LIKE prefix query to narrow the candidates without a spatial extension. GeoHashes also work well as shard keys, cache keys and coarse location labels in logs. They are a first-pass filter, not a replacement for exact coordinates, geodesic distance calculations or a true spatial index.'
---

## What a GeoHash is

A GeoHash is a short string that encodes a latitude and longitude using a public, deterministic algorithm. It does not project the coordinates or change what they mean. Instead it repeatedly bisects the surface along longitude and latitude: each bisection records which half the point falls into, and every five bits are mapped to one character from a 32-symbol alphabet. The longitude and latitude bits are interleaved, so each character carries information about both axes.

The useful property is that **a shared prefix means a shared rectangular cell**. A longer string is a smaller cell, and it always extends the shorter string. The point `116.3974, 39.9088` near Tiananmen Square, Beijing, encodes to `wx4g0bk` at seven characters; its first five characters `wx4g0` cover a much larger area around the city. Encoding and decoding are deterministic: the same coordinate at the same length always produces the same string.

GeoHash is not the only spatial encoding. Google's S2 and Uber's H3 solve a similar problem with different cell shapes: S2 uses spherical cells, H3 uses hexagons, and GeoHash uses latitude-longitude rectangles. GeoHash remains popular because it is easy to implement, short enough for a URL and directly storable in an ordinary text column.

## A prefix is a spatial index

Because a prefix maps to a fixed rectangle, a GeoHash column can serve as the first filter of a spatial query. If a table stores a `geohash7` column, a nearby search can compute the seven-character hash of the centre point and run `LIKE 'wx4g0%'` to fetch rows in the same cell. That query can use the leftmost prefix of a B-tree index and does not require PostGIS or another spatial extension.

There are two important limits. First, the result is a rectangle, not a circle: points in the same cell may still lie outside the requested radius, so a geodesic distance filter is still required. Second, the centre cell alone misses points just across a boundary. In practice you fetch the centre and its eight neighbours, or split a larger query area into several prefix ranges.

Another easy mistake is **comparing prefixes of different lengths**. `wx4g` and `wx4g0bk` both refer to Beijing, but the first is a cell roughly 20 kilometres wide and the second is roughly 150 metres wide. Mixing lengths makes the meaning of "nearby" change silently in different parts of the code. Fix the length in the schema, or state explicitly what area the current length represents.

## Length and precision

The table below gives the approximate error and cell size for 1 to 12 characters. The error is half the cell width, the distance from the centre to an edge; the size is the full cell width. East-west sizes are measured at the equator.

| Characters | Longitude error ± | Latitude error ± | Approx. cell size |
|---|---|---|---|
| 1 | 22.5° | 22.5° | 5000 km × 5000 km |
| 2 | 5.6° | 2.8° | 1250 km × 626 km |
| 3 | 0.70° | 0.70° | 157 km × 157 km |
| 4 | 0.176° | 0.088° | 39 km × 20 km |
| 5 | 0.022° | 0.022° | 4.9 km × 4.9 km |
| 6 | 0.0055° | 0.0027° | 1.2 km × 0.61 km |
| 7 | 0.00069° | 0.00069° | 153 m × 153 m |
| 8 | 0.00017° | 0.000086° | 38 m × 19 m |
| 9 | 0.000021° | 0.000021° | 4.8 m × 4.8 m |
| 10 | 0.0000054° | 0.0000027° | 1.2 m × 0.60 m |
| 11 | 0.00000067° | 0.00000067° | 15 cm × 15 cm |
| 12 | 0.00000017° | 0.000000084° | 3.7 cm × 1.9 cm |

The exact numbers depend slightly on the implementation and on latitude, but the scale is stable: each extra character shrinks the cell to roughly one quarter or one fifth of its previous width. The precision table in the tool is generated from the same constants as the calculation, and the result area highlights the length currently in use so that the choice between seven and eight characters is not guesswork.

Seven characters are common because they reduce the cell to about 150 metres, close to a city block, while keeping the string at seven characters for URLs, cache keys and log lines. Door-level or device-level work usually needs 9 to 10 characters. Deliberately coarse city-level aggregation or privacy protection often uses 5 to 6 characters so that the cell is too large to identify an individual.

## The eight neighbours and nearby search

The three-by-three grid is the usual first step of a nearby search: the centre cell plus the neighbours in the N, NE, E, SE, S, SW, W and NW directions, covering roughly a 3 × 3 block of cells. Querying only the centre cell is not enough, because a point can sit just across an edge, very close in metres yet in a different string.

Neighbours are not "the eight closest cells" in metric terms. Near the equator the cells are almost square. At higher latitudes the east-west ground width shrinks by the cosine of the latitude, so an east-west neighbour is physically narrower than a north-south neighbour at the same angular step. If the requirement is a fixed radius in metres, the nine cells are only a candidate set; a great-circle filter must make the final decision.

Two edge cases appear near the poles and the 180th meridian. Asking for a northern neighbour beyond the pole may return the original cell because there is no land or latitude left in that direction. Asking for an eastern neighbour beyond 180 degrees wraps around to the other side of the world. This tool shows "—" where a neighbour does not exist at the pole, rather than rendering a button that appears to do nothing. Wrapping across the antimeridian is handled by the library.

## Why the alphabet omits a, i, l and o

GeoHash uses 32 symbols: the digits `0-9` and the 22 lowercase letters `bcdefghjkmnpqrstuvwxyz`. Thirty-two is exactly five binary bits, so each character carries five bits without loss. The four omitted letters are `a`, `i`, `l` and `o`. The reason is human factors rather than technology: in small type, handwriting, low-resolution screens and voice dictation they are easily confused with the digits `1`, `0` and the uppercase letter `I`. Removing them visibly reduces transcription errors.

The consequence is simple: **a valid GeoHash never contains a, i, l or o**. A string containing one of them is not a GeoHash, or is another encoding such as a different Base32 variant, or was altered while being copied. This tool names the offending character and its position and lists the complete legal alphabet instead of silently skipping it.

The canonical output is lowercase. To make pasting less annoying, the tool accepts uppercase input and converts it internally, but the result area always shows the canonical lowercase form. Mixing case never produces two different locations, unlike a case-sensitive short link.

## Longitude comes first

The interleaved bit stream starts with **longitude**: bit one bisects longitude, bit two bisects latitude, bit three goes back to longitude, and so on. This order is part of the standard, not an implementation choice. A well-known self-check is the intersection of the equator and the prime meridian at `(0, 0)`: the standard encoding is `s`, while swapping the axes produces `7`. Both look perfectly legal, but they point to completely different places.

The axis order rarely causes trouble when you call a library, but it is a common source of silent errors when writing an encoder, copying test vectors or porting code from another language. The related convention is the valid range: longitude is `[-180, 180]` and latitude is `[-90, 90]`. Values outside those ranges must be rejected before encoding; clamping them silently produces a plausible but wrong location. This tool validates each axis and reports an out-of-range value in place while keeping the input.

## Common misuse: treating a GeoHash as an exact coordinate

The most common mistake is storing the decoded result as if it were the original coordinate. A GeoHash describes an **area**, and decoding can only return the centre of that area. At seven characters the cell is about 150 metres wide, so the centre can be up to roughly 100 metres from the true position. Writing the centre back into a database compresses a region into a point, and re-encoding it may land in a different cell.

The second mistake is using string equality to deduplicate "the same place". Different positions inside one cell produce the same string, so a GeoHash can tell you that two points are in the same broad area but not that they are the same point. Conversely, two points a few metres apart can straddle a cell boundary and produce completely different strings, so strict equality also misses them.

The third mistake is ignoring latitude when reasoning about distance. GeoHash cells are latitude-longitude rectangles, not ground squares; the same string has a different physical width at the equator and in high latitudes. Radius queries, area calculations and distance sorting still need a geodesic formula or a projected planar coordinate system. Counting cells and multiplying by a fixed number of metres is not a distance calculation.

Finally, there is privacy. GeoHash precision is gradual: five characters may reveal a city, seven a neighbourhood, nine or more a specific building. Before publishing photographs, logs or datasets with precise GeoHashes, truncate them to an appropriate length. Truncating the suffix still places the point in the same broad region while making it much harder to identify an individual.

## How this tool calculates

Encoding, decoding, neighbours and the precision table all run in your browser. Coordinates and strings are never uploaded to a server. Heavy recalculation is debounced by 300 milliseconds so that the result area does not reflow on every keystroke, while error messages and `aria-invalid` update immediately for screen-reader users. Only non-sensitive options such as the mode, precision and comma convention are remembered locally; coordinate and GeoHash inputs are not written to localStorage. A share link contains only the inputs and options, never the computed result.

## Frequently asked questions

### Why is a seven-character GeoHash often described as 150 metres?

Seven characters carry 35 binary bits: about 18 for longitude and 17 for latitude. Longitude divides 360 degrees into 2^18 intervals of roughly 0.00137 degrees, which is about 152 metres at the equator; latitude divides 180 degrees into 2^17 intervals of the same angular width, also about 152 metres. So the cell is roughly 150 metres across. Away from the equator the east-west width shrinks by the cosine of the latitude, making the cell narrower.

### Does a longer GeoHash always mean a more accurate position?

It means a smaller cell, not a more accurate original point. A GeoHash describes a rectangle, and decoding returns the centre of that rectangle. The true location can be anywhere inside the box. With seven characters the centre can be up to about 100 metres away from the original point, so a decoded GeoHash should never be stored as if it were an exact coordinate.

### Why are a, i, l and o missing from the alphabet?

A GeoHash needs 32 symbols to represent five binary bits. The standard uses the digits 0-9 plus the lowercase letters b c d e f g h j k m n p q r s t u v w x y z. The four omitted letters are easily confused with 1, 0 and uppercase I in small type, handwriting or low-resolution screens, so removing them cuts transcription and dictation errors. Seeing any of them means the string is not a valid GeoHash or another encoding was mixed in.

### What should I watch out for when using GeoHash for nearby search?

Pick the character length that matches your radius, fetch the centre cell and its eight neighbours, then filter every candidate with a great-circle distance. Querying only the centre cell misses points just across a cell boundary. The nine-cell square also does not cover a circle, and at high latitudes the east-west neighbour is physically narrower. For larger radii, take more rings or use a database with a real spatial index.

### What are GeoHashes good for in a database?

Points sharing a prefix sit in the same rectangle, so an ordinary B-tree index can use a LIKE prefix query to narrow the candidates without a spatial extension. GeoHashes also work well as shard keys, cache keys and coarse location labels in logs. They are a first-pass filter, not a replacement for exact coordinates, geodesic distance calculations or a true spatial index.

## References

- [Elasticsearch: geohash grid aggregation](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-aggregations-bucket-geohashgrid-aggregation.html)
- [Geohash: algorithm background and alphabet](https://en.wikipedia.org/wiki/Geohash)
