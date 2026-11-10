/**
 * 英文文案 —— **基准语言**（技术方案 6.2）
 *
 * 本文件的键集合定义 `Key` 类型。其他语言字典若缺任一键，
 * `Record<Lang, Record<Key, string>>` 会直接导致 **TypeScript 编译失败**，
 * 而不是运行时才发现。这是 PRD「禁止半翻译页面」的机制化落地。
 *
 * 键命名约定：
 *   nav.*      导航与页脚链接
 *   a11y.*     aria-label 等无障碍文案
 *   common.*   跨工具复用的动作按钮与状态
 *   coord.*    坐标输入相关标签
 *   privacy.*  SR-07 常驻声明
 *   err.*      SR-06 三段式错误提示
 *   home.*     首页与索引
 *   search.*   站内搜索（FR-02）
 *   cookie.*   Cookie 同意（FR-10）
 *   tool.{slug}.*  单个工具专属文案
 *
 * 插值语法：`{name}`，由 t() 做字面替换。
 */

const en = {
  /* ---------- 导航 ---------- */
  'nav.home': 'Home',
  'nav.allTools': 'All tools',
  'nav.guide': 'Guides',
  'nav.about': 'About',
  'nav.contact': 'Contact',
  'nav.privacy': 'Privacy Policy',
  'nav.disclaimer': 'Disclaimer',
  'nav.cookieSettings': 'Cookie settings',
  'nav.menu.open': 'Open menu',
  'nav.menu.close': 'Close menu',

  /* ---------- 无障碍 ---------- */
  'a11y.skip': 'Skip to main content',
  'a11y.mainNav': 'Main navigation',
  'a11y.footerNav': 'Footer navigation',
  'a11y.breadcrumb': 'Breadcrumb',
  'a11y.langSwitch': 'Change language',
  'a11y.tool': 'Tool',
  'a11y.result': 'Result',
  'a11y.related': 'Related tools',
  'a11y.advertisement': 'Advertisement',
  'a11y.search': 'Search tools',
  'a11y.siteHome': 'GeoToolbox home',

  /* ---------- 通用动作 ---------- */
  'common.convert': 'Convert',
  'common.calculate': 'Calculate',
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.copyFailed': 'Copy failed — select the text and copy manually',
  'common.share': 'Share link',
  'common.shared': 'Link copied',
  'common.download': 'Download',
  'common.cancel': 'Cancel',
  'common.reset': 'Reset',
  'common.clear': 'Clear',
  'common.advanced': 'Advanced options',
  'common.loading': 'Working…',
  'common.close': 'Close',
  'common.optional': 'optional',
  'common.required': 'required',
  'common.tryExample': 'Try an example',
  'common.backToTools': 'Browse all tools',
  'common.allTools': 'All tools',
  'common.batch': 'Batch mode',
  'common.batchHint': 'Upload a CSV/TSV file to process many rows at once.',
  'common.desktopRecommended': 'This tool works best on a desktop, but everything is still usable here.',
  /* FR-05：分享按钮旁常驻提示 */
  'common.shareWarning': 'The link contains everything you typed. Do not share sensitive coordinates.',
  'common.shareTooLarge': 'Too large to share as a link. Download the file and send that instead.',
  'common.shareReset': 'The parameters in that link could not be read, so the tool was reset.',
  'common.swap': 'Swap',

  /* ---------- 坐标输入 ---------- */
  'coord.lng': 'Longitude',
  'coord.lat': 'Latitude',
  'coord.lngLat': 'Longitude, Latitude',
  'coord.pairPlaceholder': '116.3974, 39.9088',
  'coord.height': 'Height',
  'coord.source': 'Source CRS',
  'coord.target': 'Target CRS',
  'coord.precision': 'Decimal places',
  'coord.start': 'Start point',
  'coord.end': 'End point',
  'coord.useMyLocation': 'Use my location',
  'coord.locating': 'Locating…',
  'coord.locationDenied': 'Location unavailable. Enter coordinates manually.',
  'coord.accuracy': 'GPS accuracy ±{r} m',
  /* SR-01 规则 ⑤：逗号含义手动覆盖。
     三种目标语言都用句点作小数点，所以默认「分隔符」几乎总是对的；
     这个开关是为「从德语 / 俄语来源的 CSV 里粘了一行」准备的。
     选项文案必须带例子 —— 光说「小数点」用户不知道指哪一种写法。 */
  'coord.commaMeaning': 'Meaning of commas',
  'coord.comma.auto': 'Decide automatically',
  'coord.comma.separator': 'Field separator — 116.3974, 39.9088',
  'coord.comma.decimal': 'Decimal point — 116,3974',
  'coord.comma.hint': 'Only change this if your data uses a comma as the decimal separator.',

  /* ---------- 隐私声明（SR-07 常驻） ---------- */
  'privacy.notice': 'All calculations run locally in your browser. Nothing is uploaded to any server.',

  /* ---------- 错误提示（SR-06 三段式：原因 / 正确写法 / 示例） ---------- */
  'err.empty.title': 'Waiting for input',
  'err.empty.hint': 'Enter a coordinate, or load the example to see how it works.',
  'err.parse.title': 'Could not read this coordinate',
  'err.parse.hint': 'Accepted formats: decimal degrees, degrees-minutes-seconds, or a GeoHash string.',
  'err.lng.range': 'Longitude out of range.',
  'err.lng.range.hint': 'Valid range is −180 to +180. Check that you did not swap the two fields.',
  'err.lat.range': 'Latitude out of range.',
  'err.lat.range.hint': 'Valid range is −90 to +90. Check that you did not swap the two fields.',
  'err.number': 'Enter a plain number with a period as the decimal separator, e.g. 116.3974',
  'err.file.tooLarge': 'File is too large ({actual} > {limit}).',
  'err.file.type': 'Unsupported file type. Expected {expected}.',
  'err.generic': 'Something went wrong. Your input has been kept.',

  /* ---------- 首页与索引 ---------- */
  'home.h1': 'Geospatial tools that never leave your browser',
  'home.intro':
    'Eleven focused utilities for coordinates, projections and vector formats. No sign-up, no upload — every calculation happens on your own device.',
  'home.section.tools': 'All tools',
  'home.section.why': 'Why this site',
  'home.why.local': 'Nothing is uploaded. Sensitive boundaries and tracks stay on your machine.',
  'home.why.fast': 'Static pages, no waiting. Results appear as you type.',
  'home.why.shareable': 'Every result has a shareable link that restores the exact input.',
  'home.toolCount': '{n} tools',
  'home.openTool': 'Open tool',
  'home.section.guides': 'Background reading',
  'home.guides.all': 'All guides',

  /* ---------- Cookie 同意（FR-10） ---------- */
  'cookie.title': 'Cookie preferences',
  'cookie.body':
    'We use strictly necessary storage to remember your preferences. With your consent we also show personalised ads via Google AdSense. Declining changes nothing about how the tools work.',
  'cookie.accept': 'Accept all',
  'cookie.reject': 'Necessary only',
  'cookie.purpose.necessary': 'Strictly necessary — language, precision and layout preferences. Always on.',
  'cookie.purpose.ads': 'Advertising — personalised ads served by Google AdSense.',

  /* ---------- 文档区 ---------- */
  'doc.onThisPage': 'On this page',
  'doc.related': 'Related tools',
  'doc.faq': 'Frequently asked questions',
  'doc.howItWorks': 'How it works',
  'doc.moreInGroup': 'More in this group',

  /* ---------- 页脚 ---------- */
  'footer.rights': '© {year} {site}. All calculations run locally.',
  'footer.noAccount': 'No account. No upload. No tracking of your data.',

  /* ---------- T01 坐标系转换 ----------
     注意：SEO 的 <title> 与 meta description 放在文档 frontmatter 里
     （src/i18n/content/tools/coord-convert/{lang}.md），不在本字典中。
     这里只放界面上可见的文案。 */
  'tool.coord-convert.h1': 'WGS84 / CGCS2000 Coordinate Converter',
  'tool.coord-convert.lead': 'Convert between WGS84 and CGCS2000, which are equivalent at practical precision.',
  'tool.coord-convert.identity': 'Source and target are the same system, so the value is returned unchanged.',
  'tool.coord-convert.cgcs2000': 'CGCS2000 is treated as equivalent to WGS84 here. The two differ only at centimetre level.',
  'tool.coord-convert.allTargets': 'All target systems',
  'tool.coord-convert.precisionNote': 'WGS84 and CGCS2000 differ by less than a centimetre in practice. This tool treats them as equivalent and applies no offset in either direction.',

  /* ---------- T02 经纬度格式转换 ----------
     SEO 的 <title> 与 meta description 同样放在文档 frontmatter 里
     （src/i18n/content/tools/dms-decimal/{lang}.md），不在本字典中。
     带 {name} / {value} 的键由组件用字面替换插值，与 t() 的语法保持一致。 */
  'tool.dms-decimal.h1': 'DMS ↔ Decimal Degrees Converter',
  'tool.dms-decimal.lead':
    'Paste a longitude/latitude pair, choose the source and target formats, and get the converted result.',
  'tool.dms-decimal.sourceFormat': 'Source format',
  'tool.dms-decimal.targetFormat': 'Target format',
  'tool.dms-decimal.format.auto': 'Detect automatically',
  'tool.dms-decimal.target.dmsSymbolic': 'DMS (symbolic)',
  'tool.dms-decimal.target.dmsTextual': 'DMS (spelled out)',
  'tool.dms-decimal.coordHint':
    'Longitude first, latitude second. One pair per line — paste several lines at once.',
  'tool.dms-decimal.lineError': 'Line {n}: {message}',
  'tool.dms-decimal.errFormat':
    'The input does not match the selected source format ({name}).',
  'tool.dms-decimal.errFormatHint':
    'Switch the source format to “Detect automatically”, or rewrite the coordinates in the selected format.',
  'tool.dms-decimal.needBoth': 'Enter both longitude and latitude.',
  'tool.dms-decimal.needBothHint': 'Separate them with a comma, e.g. 116.3974, 39.9088.',
  /* SR-01 规则 ④：回显系统把输入识别成了哪种格式，任何误判都要对用户可见 */
  'tool.dms-decimal.detected': 'Read as',
  'tool.dms-decimal.name.decimal': 'Decimal degrees',
  'tool.dms-decimal.name.dm': 'Degrees & minutes',
  'tool.dms-decimal.name.dms': 'Degrees, minutes & seconds',
  /* 度分秒的两种写法（PRD T02）。后缀式命名：与格式名拼成一行标签 */
  'tool.dms-decimal.symbolic': 'symbolic',
  'tool.dms-decimal.textual': 'spelled out',
  // ⚠️ 归一化不能悄悄发生（PRD T02：「并在结果中提示『输入已归一化』」）。
  // 分与秒的提示必须分开写 —— 进位去向不同，笼统一句「已归一化」用户无法核对。
  'tool.dms-decimal.normalized.seconds': 'The seconds value was 60 or more, so it was carried over into minutes.',
  'tool.dms-decimal.normalized.minutes': 'The minutes value was 60 or more, so it was carried over into degrees.',
  /* PRD T02 专属异常②：单向转换合法，缺失项不是错误 */
  'tool.dms-decimal.notProvided': 'Not provided',
  /* PRD T02 专属异常①：按十进制度处理，同时给出另一种解读让用户自行确认 */
  'tool.dms-decimal.alternative':
    'This could also be read as {name}, which would give {value}. Check which meaning you intended.',
  'tool.dms-decimal.partialHint':
    'Filling in a single field is fine — the other side is reported as not provided instead of raising an error.',
  'tool.dms-decimal.precisionNote':
    'Decimal places applies to the fractional part of all three formats. For scale: the 8th decimal place of a degree is about 1 mm, one arcsecond is about 31 m, and 0.01 of an arcsecond is about 0.3 m.',

  /* ---------- T03 Projected CRS conversion (EPSG) ---------- */
  'tool.epsg-convert.h1': 'Projected CRS Converter (EPSG)',
  'tool.epsg-convert.lead': 'Convert coordinates between any two EPSG coordinate systems — WGS 84, UTM, Web Mercator, China’s Gauss-Krüger bands and Japan’s 19 plane rectangular zones. Everything runs in your browser.',
  'tool.epsg-convert.coordHint': 'Enter the coordinate in the source system: decimal degrees for geographic CRS, metres for projected CRS. Grouping commas such as 4,420,000 are accepted.',
  'tool.epsg-convert.customCode': 'EPSG code',
  'tool.epsg-convert.customCodeHint': 'Enter the numeric code, for example 6669 or 4548.',
  'tool.epsg-convert.invalidCode': 'Enter a valid positive EPSG code (numbers only).',
  'tool.epsg-convert.errNotFound': 'No projection definition was found for that EPSG code. Try another code or pick one from the common list.',
  'tool.epsg-convert.errNumber': 'Enter a number.',
  'tool.epsg-convert.errGeoRange': 'Longitude must be between −180 and 180, and latitude between −90 and 90.',
  'tool.epsg-convert.errNeedBoth': 'Fill in both coordinate values to see a result.',
  'tool.epsg-convert.errGeneric': 'The coordinate could not be converted. Check the source CRS and the values.',
  'tool.epsg-convert.autoNeedGeo': 'An automatic zone needs a longitude. Choose a geographic source CRS or enter a longitude first.',
  'tool.epsg-convert.japanUtmRange': 'JGD2011 / UTM is defined for zones 51–55 only (Japan). Pick a WGS 84 UTM zone or a plane rectangular zone instead.',
  'tool.epsg-convert.loadingFull': 'Loading the full EPSG table…',
  'tool.epsg-convert.loadFailed': 'The full EPSG table could not be loaded. Check your connection and try again, or pick a CRS from the common list.',
  'tool.epsg-convert.axisNoteJapan': 'Japan’s plane rectangular system uses X for northing and Y for easting — the opposite of the GIS convention. Enter northing (X) in the first field.',
  'tool.epsg-convert.axisNoteXY': 'X is easting and Y is northing (GIS convention). Negative values are valid in some systems, including Japan’s plane rectangular zones west and south of the origin.',
  'tool.epsg-convert.eastX': 'X (easting)',
  'tool.epsg-convert.northY': 'Y (northing)',
  'tool.epsg-convert.northX': 'X (northing)',
  'tool.epsg-convert.eastY': 'Y (easting)',
  'tool.epsg-convert.xLongitude': 'X (longitude)',
  'tool.epsg-convert.yLatitude': 'Y (latitude)',
  'tool.epsg-convert.swapXY': 'Swap X and Y',
  'tool.epsg-convert.swapWarning': 'The values look swapped: X is in the millions while Y is small. In the GIS convention X is easting and Y is northing. Swap them and check the result.',
  'tool.epsg-convert.magnitudeWarning': 'These values look like longitude and latitude, not projected coordinates. Projected coordinates are normally in metres and much larger.',
  'tool.epsg-convert.resultTitle': 'Result',
  'tool.epsg-convert.colSource': 'Source CRS',
  'tool.epsg-convert.colTarget': 'Target CRS',
  'tool.epsg-convert.datumShift': 'Datum transformation',
  'tool.epsg-convert.shift.none': 'Not required (same datum or WGS 84-compatible)',
  'tool.epsg-convert.shift.7param': 'Simplified 7-parameter (accuracy about 1–5 m)',
  'tool.epsg-convert.shift.missing': 'No parameters available',
  'tool.epsg-convert.shift.custom': 'Custom 7-parameter',
  'tool.epsg-convert.missingWarning': 'No datum transformation parameters are available for this pair, so a null transformation would be wrong by metres or more. Results stay hidden until you explicitly continue. JGD2000 ↔ JGD2011 needs Japan’s semi-dynamic correction, and Xian 1980 needs official parameters; this site ships neither.',
  'tool.epsg-convert.allowMissing': 'Continue without a datum transformation (results may be off by metres)',
  'tool.epsg-convert.custom7': 'Use a custom 7-parameter transformation',
  'tool.epsg-convert.custom7Hint': 'Bursa-Wolf parameters: dx, dy, dz in metres; rx, ry, rz in arc-seconds; scale in ppm. Applied to the source CRS.',
  'tool.epsg-convert.custom7Incomplete': 'Enter either 3 or 7 numeric values.',
  'tool.epsg-convert.dx': 'dx (m)',
  'tool.epsg-convert.dy': 'dy (m)',
  'tool.epsg-convert.dz': 'dz (m)',
  'tool.epsg-convert.rx': 'rx (″)',
  'tool.epsg-convert.ry': 'ry (″)',
  'tool.epsg-convert.rz': 'rz (″)',
  'tool.epsg-convert.scale': 'scale (ppm)',
  'tool.epsg-convert.centralMeridian': 'Central meridian: {value}',
  'tool.epsg-convert.utmZone': 'UTM zone: {value}',
  'tool.epsg-convert.emptyTitle': 'Convert between EPSG coordinate systems',
  'tool.epsg-convert.emptyBody': 'Pick a source and target CRS, then enter a coordinate. For example, convert WGS 84 longitude/latitude to a UTM or Gauss-Krüger grid.',
  'tool.epsg-convert.copyPair': 'Copy X, Y',
  'tool.epsg-convert.identity': 'Source and target are the same CRS, so the values are returned unchanged.',
  'tool.epsg-convert.precisionNote1': 'Datum transformations use simplified 7-parameter (Bursa-Wolf) models with an accuracy of about 1–5 m.',
  'tool.epsg-convert.precisionNote2': 'No epoch correction is applied (Japan’s semi-dynamic correction or plate motion), so results are not suitable for high-precision surveying.',
  'tool.epsg-convert.precisionNote3': 'Results are not a legal survey reference.',

  /* ---------- T08 GeoHash encode / decode ----------
     SEO's <title> and meta description live in the document frontmatter.
     Keys containing {n} / {char} / {alphabet} / {p} are interpolated by the
     component with literal replacement, matching t()'s syntax. */
  'tool.geohash.h1': 'GeoHash Encode and Decode',
  'tool.geohash.lead':
    'Turn coordinates into a short GeoHash string and back. Decoding gives the cell centre, its bounding box, the ground size and the eight neighbouring cells.',
  'tool.geohash.mode': 'Conversion direction',
  'tool.geohash.mode.encode': 'Coordinates → GeoHash',
  'tool.geohash.mode.decode': 'GeoHash → Coordinates',
  'tool.geohash.encodeHint': 'Enter decimal degrees. The GeoHash length sets how large the cell is.',
  'tool.geohash.decodeHint': 'Case does not matter. Lengths from 1 to 12 characters are accepted.',
  'tool.geohash.precision': 'GeoHash length',
  'tool.geohash.precisionHint': '1 to 12 characters. Seven characters is roughly 150 m across.',
  'tool.geohash.hash': 'GeoHash string',
  'tool.geohash.hashHint':
    'Only digits and the letters b c d e f g h j k m n p q r s t u v w x y z — a, i, l and o are excluded by the standard.',
  /* SR-06 three-part error: what happened, why, what to do */
  'tool.geohash.errNumber': 'That is not a number I can read.',
  'tool.geohash.errNumberHint':
    'Use digits, one period as the decimal separator and an optional leading minus sign. If your source uses a comma as the decimal point, change the meaning of commas under advanced options.',
  'tool.geohash.needBoth': 'Fill in both longitude and latitude to encode a GeoHash.',
  /* PRD T08 exception ②: over-long precision is clamped and reported */
  'tool.geohash.hashTooLong': 'The input is longer than 12 characters. Only the first 12 are used.',
  'tool.geohash.precisionClamped': 'The length was clamped to {p} characters; GeoHash supports 1 to 12.',
  /* PRD T08 exception ①: name the offending character and its position */
  'tool.geohash.errIllegal': 'Character {n} — “{char}” — is not a legal GeoHash character.',
  'tool.geohash.errIllegalHint':
    'A GeoHash uses only 0-9 and the letters b c d e f g h j k m n p q r s t u v w x y z. The letters a, i, l and o are deliberately excluded because they look like 1, 0 and I.',
  'tool.geohash.errAlphabet': 'Legal characters: {alphabet}',
  'tool.geohash.result.hash': 'GeoHash',
  'tool.geohash.result.center': 'Centre point',
  'tool.geohash.result.sw': 'South-west corner',
  'tool.geohash.result.ne': 'North-east corner',
  'tool.geohash.result.size': 'Approx. ground size',
  'tool.geohash.result.precision': 'Precision (characters)',
  'tool.geohash.result.neighbors': 'Neighbouring cells',
  'tool.geohash.gridCenter': 'This cell',
  'tool.geohash.gridHint': 'Select any neighbouring GeoHash to load it into the decoder.',
  /* SR-12: an approximation must not masquerade as exact */
  'tool.geohash.sizeNote':
    'The east-west size is measured at the equator. Away from it the real width shrinks by the cosine of the latitude.',
  'tool.geohash.precisionTable': 'Precision table (1–12 characters)',
  'tool.geohash.col.precision': 'Characters',
  'tool.geohash.col.lngError': 'Longitude error ± (°)',
  'tool.geohash.col.latError': 'Latitude error ± (°)',
  'tool.geohash.col.size': 'Approx. cell size',
  'tool.geohash.current': 'Current',
  /* SR-03: the precision basis is stated in the tool, not buried in docs */
  'tool.geohash.precisionNote':
    'A decoded coordinate is the centre of the cell. A GeoHash describes an area, not a precise point: the same string covers every location inside its bounding box.',
  /* Eight direction names are looked up through the component's DIR_KEY table.
     ⚠️ All eight keys must exist — a missing one renders as undefined in the grid */
  'tool.geohash.dir.n': 'N',
  'tool.geohash.dir.ne': 'NE',
  'tool.geohash.dir.e': 'E',
  'tool.geohash.dir.se': 'SE',
  'tool.geohash.dir.s': 'S',
  'tool.geohash.dir.sw': 'SW',
  'tool.geohash.dir.w': 'W',
  'tool.geohash.dir.nw': 'NW',

  /* ---------- T06 Vector format converter ---------- */
  'tool.format-convert.h1': 'Vector Format Converter',
  'tool.format-convert.lead':
    'Convert GeoJSON, KML/KMZ, GPX, CSV/TSV, TopoJSON and WKT in your browser. Files never leave your device — no upload, no server.',
  'tool.format-convert.modeFile': 'Upload a file',
  'tool.format-convert.modePaste': 'Paste text',
  'tool.format-convert.sourceLabel': 'Source format',
  'tool.format-convert.sourceAuto': 'Detect automatically',
  'tool.format-convert.privacyNote':
    'The file is read only in this browser tab and is never uploaded. Closing the page discards it.',
  'tool.format-convert.dropTitle': 'Drop a vector data file here',
  'tool.format-convert.dropHint': 'GeoJSON, KML, KMZ, GPX, CSV/TSV, TopoJSON, WKT or a Shapefile ZIP',
  'tool.format-convert.shapefileHint':
    'Shapefile: zip the .shp/.dbf/.shx/.prj files together first. Only the first layer is read.',
  'tool.format-convert.chooseFile': 'Choose file',
  'tool.format-convert.replaceFile': 'Choose another file',
  'tool.format-convert.encoding': 'File encoding',
  'tool.format-convert.encUtf8': 'UTF-8 (default)',
  'tool.format-convert.encGbk': 'GBK / GB18030 (legacy Chinese)',
  'tool.format-convert.limitHint': 'Maximum 20 MB and 50,000 features per file.',
  'tool.format-convert.pasteLabel': 'Paste vector data',
  'tool.format-convert.pasteHint':
    'Up to 200,000 characters. The format is detected from the content.',
  'tool.format-convert.pastePlaceholder':
    'Paste GeoJSON, KML, GPX, CSV, TopoJSON or WKT…',
  'tool.format-convert.errCsvColumns':
    'Longitude and latitude columns could not be detected. Choose them below — nothing is guessed.',
  'tool.format-convert.errCsvEmpty': 'No header row was found in this CSV.',
  'tool.format-convert.csvLat': 'Latitude column',
  'tool.format-convert.csvLng': 'Longitude column',
  'tool.format-convert.csvChoose': 'Select a column',
  'tool.format-convert.parsedTitle': 'Parsed input',
  'tool.format-convert.summaryCount': '{count} features',
  'tool.format-convert.summaryVertices': '{count} vertices',
  'tool.format-convert.summaryTypes': 'Geometry types',
  'tool.format-convert.summaryProps': 'Properties',
  'tool.format-convert.crsWarning':
    'No coordinate system transformation is performed. If the data is not WGS 84, the result may be misplaced — run the CRS converter first.',
  'tool.format-convert.issuesTitle': 'Issues found ({count})',
  'tool.format-convert.issueFeature': 'Feature {index}',
  'tool.format-convert.issueEmpty': 'empty geometry',
  'tool.format-convert.issueRange': 'coordinate outside −180…180 / −90…90',
  'tool.format-convert.issueRing': 'polygon ring is not closed or has too few points',
  'tool.format-convert.issueInvalid': 'geometry could not be parsed',
  'tool.format-convert.issueRow': 'row skipped because latitude/longitude is missing',
  'tool.format-convert.featurePreview': 'First 20 features',
  'tool.format-convert.colIndex': '#',
  'tool.format-convert.colType': 'Type',
  'tool.format-convert.colName': 'Name',
  'tool.format-convert.targetLabel': 'Output format',
  'tool.format-convert.sameFormatNote':
    'Input and output use the same format, so this is a formatting and validation pass.',
  'tool.format-convert.optIndent': 'Pretty-print (indented output)',
  'tool.format-convert.optDigits': 'Coordinate decimal places (0–12)',
  'tool.format-convert.optRemoveEmpty': 'Remove empty properties',
  'tool.format-convert.optGpxAttrs': 'GPX attribute handling',
  'tool.format-convert.gpxAttrsDesc':
    'Keep name and description; merge other properties into the description',
  'tool.format-convert.gpxAttrsName': 'Keep name only',
  'tool.format-convert.unsupportedBody':
    '{count} features use geometry types GPX cannot store ({types}). Choose whether to skip them.',
  'tool.format-convert.unsupportedSkip': 'Skip these features and convert',
  'tool.format-convert.unsupportedCancel': 'Cancel and choose another format',
  'tool.format-convert.resultTitle': 'Converted output',
  'tool.format-convert.previewLimited':
    'Preview shows the first {lines} lines; the download contains the full result.',
  'tool.format-convert.warnNullGeometry': 'Features with a null geometry were skipped.',
  'tool.format-convert.emptyTitle': 'Convert vector data formats',
  'tool.format-convert.emptyBody':
    'Upload a file or paste data to convert between GeoJSON, KML, GPX, CSV, TopoJSON and WKT.',
  'tool.format-convert.errFileSize':
    'This file is {size}; the limit is {limit}. Split the data or simplify it first.',
  'tool.format-convert.errFeatureLimit':
    'The input contains {count} features; the limit is {limit}. Split the data first.',
  'tool.format-convert.errPasteLimit':
    'The pasted text exceeds {limit} characters. Use file upload instead.',
  'tool.format-convert.errParse':
    'The input could not be parsed. Check that it is not truncated and that the extension matches the actual format.',
  'tool.format-convert.errNoFeatures':
    'No geographic features were found. If this is a CSV, check that the longitude and latitude columns contain values.',
  'tool.format-convert.errSerialize':
    'The output could not be generated. Try another target format.',
  'tool.format-convert.errInvalidJson': 'The JSON is invalid.',
  'tool.format-convert.errInvalidGeojson': 'The GeoJSON structure is invalid.',
  'tool.format-convert.errInvalidTopojson': 'The TopoJSON structure is invalid.',
  'tool.format-convert.errInvalidXml': 'The XML is invalid or truncated.',
  'tool.format-convert.errInvalidKmz': 'The KMZ archive could not be opened.',
  'tool.format-convert.errKmzNoKml': 'The KMZ does not contain a KML file.',
  'tool.format-convert.errKmzNeedsFile':
    'KMZ must be selected as a file; it cannot be pasted.',
  'tool.format-convert.errUnknownFormat':
    'The format could not be detected. Supported inputs: GeoJSON, KML, KMZ, GPX, CSV/TSV, XLSX, GML, DXF, GMT, TopoJSON, WKT.',
  'tool.format-convert.errDom':
    'This browser cannot parse XML in the current context. Try a desktop browser.',
  'tool.format-convert.errShapefileZip': 'The ZIP archive could not be opened.',
  'tool.format-convert.errShapefileNoShp':
    'No .shp file was found in the ZIP. Zip the .shp/.dbf/.shx/.prj files together.',
  'tool.format-convert.errShapefileParse':
    'The Shapefile could not be parsed. Check that it is a valid .shp inside a ZIP.',
  'tool.format-convert.errShapefileEmpty':
    'There are no geometries that can be written to a Shapefile.',
  'tool.format-convert.errXlsx':
    'The Excel file could not be read. Check that it is .xlsx or .xls and that the first sheet has longitude and latitude columns.',
  'tool.format-convert.errInvalidGml':
    'The GML could not be parsed. Check that it is simple-feature GML containing gml:featureMember.',
  'tool.format-convert.errInvalidDxf':
    'The DXF could not be parsed. Check that it is an ASCII DXF containing an ENTITIES section.',
  'tool.format-convert.errInvalidMif':
    'The MIF could not be parsed. Check that it contains a Data section, or use a ZIP containing a .mif file.',
  'tool.format-convert.mifBinaryNote':
    'MIF/MID output is a ZIP containing data.mif and data.mid and cannot be previewed here. Unzip it and open it in MapInfo or QGIS.',
  'tool.format-convert.kmzBinaryNote':
    'KMZ output is a ZIP containing doc.kml and cannot be previewed here. Open it in Google Earth or QGIS.',
  'tool.format-convert.warnMifEmpty': 'There are no geometries that can be written to MIF.',
  'tool.format-convert.warnMifRows':
    'The MID has {rows} rows but the MIF has {objects} objects; missing attributes are empty.',
  'tool.format-convert.shapefileBinaryNote':
    'Shapefile output is a binary ZIP (.shp/.shx/.dbf/.prj/.cpg) and cannot be previewed here. Open the download in QGIS or ArcGIS.',
  'tool.format-convert.xlsxBinaryNote':
    'Excel output is a binary workbook and cannot be previewed here. Open the download in Excel, LibreOffice or WPS.',
  'tool.format-convert.warnDxfCrs':
    'The DXF declares no geographic CRS, so coordinates are used as-is. If they are projected, convert them first with the EPSG tool.',
  'tool.format-convert.warnDxfAttrs':
    'Basic DXF entities cannot carry attributes; attributes were dropped from {count} features.',
  'tool.format-convert.warnGmtHoles':
    'Plain-text GMT cannot express polygon holes; {count} interior rings were dropped.',
  'tool.format-convert.warnGmlCrs':
    'The GML declares {crs}. This tool does not reproject, so coordinates are used as-is.',
  'tool.format-convert.warnShapefilePrj':
    'A .prj was found: coordinates were reprojected to WGS 84.',
  'tool.format-convert.warnShapefileNoPrj':
    'No .prj was found: coordinates are treated as WGS 84.',
  'tool.format-convert.warnShapefileMulti':
    'The ZIP contains {count} layers; only the first one was converted.',
  'tool.format-convert.warnShapefileSkipped':
    '{count} features were skipped because their geometry cannot be stored in a Shapefile.',
  'tool.format-convert.warnShapefileFieldRenamed':
    'Some DBF field names were shortened or renamed to fit the 10-character limit.',
  'tool.format-convert.warnShapefileFieldsDropped':
    '{count} attribute fields were dropped because DBF supports at most 255 fields.',
  'tool.format-convert.errInvalidFgb':
    'The FlatGeobuf file could not be parsed. Check that it is an intact .fgb file.',
  'tool.format-convert.errFgbNeedsFile':
    'FlatGeobuf is binary and cannot be restored from pasted text. Upload a .fgb file in File mode.',
  'tool.format-convert.errInvalidGpkg':
    'The GeoPackage could not be parsed. Check that it is a SQLite database with gpkg_contents.',
  'tool.format-convert.errGpkgNeedsFile':
    'GeoPackage is a binary database and cannot be restored from pasted text. Upload a .gpkg file in File mode.',
  'tool.format-convert.errGpkgNoLayer':
    'The GeoPackage contains no feature layers (gpkg_contents is empty).',
  'tool.format-convert.fgbBinaryNote':
    'FlatGeobuf output is binary and cannot be previewed here. Open the download in QGIS, GDAL, or any FGB-capable web component.',
  'tool.format-convert.gpkgBinaryNote':
    'GeoPackage output is a SQLite database (single "features" layer, EPSG:4326) and cannot be previewed here. Open it in QGIS, GDAL, or any SQLite tool.',
  'tool.format-convert.warnFgbAttrs':
    'FGB column types are inferred from the first feature; {count} values were coerced to text.',
  'tool.format-convert.warnGpkgMulti':
    'The GeoPackage contains {count} feature layers; only the first one was converted.',
  'tool.format-convert.warnGpkgCrs':
    'The GeoPackage declares EPSG:{srid}. This tool does not reproject, so coordinates are kept as-is.',
  'tool.format-convert.warnGpkgGeometrySkipped':
    '{count} geometries could not be decoded and were left empty.',
  'tool.format-convert.warnGpkgEmptyGeometry': '{count} empty geometries were written as NULL.',

  /* ---------- T10 Buffer & circle ---------- */
  'tool.buffer-circle.h1': 'Equidistant Circles & Buffers',
  'tool.buffer-circle.lead':
    'Answer “what falls within N kilometres of this point?” Draw geodesic circles or buffer existing features, see them on the map and export GeoJSON, KML or WKT.',
  'tool.buffer-circle.modeCircle': 'Equidistant circle',
  'tool.buffer-circle.modeBuffer': 'Buffer existing features',
  'tool.buffer-circle.pickOn': 'Picking from map… (click map)',
  'tool.buffer-circle.pickOff': 'Pick centre from map',
  'tool.buffer-circle.radii': 'Radii',
  'tool.buffer-circle.radiiHint':
    'Separate multiple radii with commas, spaces or semicolons, for example 1, 3, 5.',
  'tool.buffer-circle.unit': 'Unit',
  'tool.buffer-circle.unit.m': 'metres',
  'tool.buffer-circle.unit.km': 'kilometres',
  'tool.buffer-circle.unit.mi': 'miles',
  'tool.buffer-circle.unit.nmi': 'nautical miles',
  'tool.buffer-circle.segments': 'Boundary segments',
  'tool.buffer-circle.segmentsHint':
    '128 segments is a good default. More segments give a smoother circle but more points.',
  'tool.buffer-circle.bufferInput': 'Features to buffer',
  'tool.buffer-circle.bufferPlaceholder':
    'Paste GeoJSON, KML, GPX, CSV or WKT features, or one "longitude, latitude" pair per line…',
  'tool.buffer-circle.bufferHint':
    'Points, lines and polygons are all supported; each feature is buffered once per radius. Points can also be pasted as coordinate lines.',
  'tool.buffer-circle.resultTitle': 'Result',
  'tool.buffer-circle.colRadius': 'Radius',
  'tool.buffer-circle.colArea': 'Area',
  'tool.buffer-circle.colPerimeter': 'Perimeter',
  'tool.buffer-circle.colPoints': 'Points',
  'tool.buffer-circle.exportLabel': 'Export format',
  'tool.buffer-circle.errCenter': 'Latitude must be within −90…90 and longitude within −180…180.',
  'tool.buffer-circle.errRadiusNumber': 'Enter at least one numeric radius.',
  'tool.buffer-circle.errRadiusPositive': 'Every radius must be greater than zero.',
  'tool.buffer-circle.errRadiusLimit':
    'A single radius cannot exceed 20,000 km. Beyond that the circle approaches a hemisphere and the concept stops being meaningful.',
  'tool.buffer-circle.errBufferEmpty':
    'Add at least one feature to buffer, or switch to equidistant circle mode.',
  'tool.buffer-circle.errBufferParse':
    'The buffer input could not be parsed. Paste GeoJSON, KML, GPX, CSV or WKT.',
  'tool.buffer-circle.precisionReduced':
    'Boundary segments were reduced to {segments} to keep the map responsive.',
  'tool.buffer-circle.sphereFallback':
    'Some boundary points near the antipode used a spherical approximation.',
  'common.mapDragPrompt': 'Tap to enable map dragging',
  'common.mapLoading': 'Loading map…',
  'common.mapTileError':
    'Map tiles failed to load. Calculations and export still work.',
  'common.mapPreview': 'Map preview',
  'common.pickFromMap': 'Pick from map',
  'common.pickingMap': 'Click the map to pick a coordinate…',
  'common.mapPreviewHint':
    'The map is for visual verification only. Calculations use the values shown above.',
  'common.basemap': 'Basemap',
  'common.basemapStreet': 'Street',
  'common.basemapSatellite': 'Satellite',
  'common.basemapTerrain': 'Terrain',

  /* ---------- T14 Google tile coordinates ---------- */
  'tool.tile-coords.h1': 'Google Tile Coordinates',
  'tool.tile-coords.startDraw': 'Draw extent',
  'tool.tile-coords.stopDraw': 'Stop drawing',
  'tool.tile-coords.drawHint':
    'Draw an extent or import GeoJSON — one replaces the other. Panning pauses while drawing.',
  'tool.tile-coords.bboxTitle': 'Current extent',
  'tool.tile-coords.clearSelection': 'Clear selection',
  'tool.tile-coords.west': 'West',
  'tool.tile-coords.south': 'South',
  'tool.tile-coords.east': 'East',
  'tool.tile-coords.north': 'North',
  'tool.tile-coords.selectEmpty': 'No extent yet. Drag on the map, or click two opposite corners.',
  'tool.tile-coords.crossAntimeridian':
    'The extent crosses the 180° meridian; tiles on both sides are included.',
  'tool.tile-coords.importTitle': 'Import data',
  'tool.tile-coords.otherFormatHint': 'For other formats, convert them first with the',
  'tool.tile-coords.formatConvert': 'format converter',
  'tool.tile-coords.importing': 'Reading…',
  'tool.tile-coords.imported':
    'Imported {name}: {count} features. The original boundary is shown on the map.',
  'tool.tile-coords.boundaryNote':
    'Tiles are filtered by the original boundary — only tiles intersecting it are kept.',
  'tool.tile-coords.zoomTitle': 'Zoom levels',
  'tool.tile-coords.zoomMin': 'Minimum Z',
  'tool.tile-coords.zoomMax': 'Maximum Z',
  'tool.tile-coords.zoomRange': '0–22',
  'tool.tile-coords.generate': 'Generate tile coordinates',
  'tool.tile-coords.generateHint':
    'Uses the current extent and zoom levels. Regenerate after changing them.',
  'tool.tile-coords.generating': 'Generating',
  'tool.tile-coords.packing': 'Preparing CSV',
  'tool.tile-coords.cancelGenerate': 'Cancel',
  'tool.tile-coords.progress': '{done} / {total} processed',
  'tool.tile-coords.warnLarge':
    'About {count} tiles. Generation, preview and download will be very slow, and the browser may stutter or run out of memory. Consider lowering the zoom levels or narrowing the extent.',
  'tool.tile-coords.total': '{total} tiles, sorted by Z → Y → X.',
  'tool.tile-coords.downloadCsv': 'Download CSV',
  'tool.tile-coords.downloadZip': 'Download ZIP (one CSV per zoom)',
  'tool.tile-coords.downloadHint':
    'One CSV per zoom level with the header x, y, z; multiple levels are packed into a ZIP so no single huge table has to be parsed.',
  'tool.tile-coords.errZoomRange': 'Zoom levels must be integers between 0 and 22.',
  'tool.tile-coords.errZoomOrder': 'The minimum zoom level cannot be greater than the maximum.',
  'tool.tile-coords.errEmptyFile': 'The file is empty or contains nothing readable.',
  'tool.tile-coords.errGeojsonOnly':
    'Only GeoJSON files are supported. Convert the file to GeoJSON with the format converter first.',
  'tool.tile-coords.errParse': 'The file could not be parsed. Check that it is valid GeoJSON.',
  'tool.tile-coords.errNoCoords':
    'The file contains no usable coordinates. Check that features have longitude and latitude.',
  'tool.tile-coords.errCoordRange':
    'Coordinates are out of range: longitude must be −180…180 and latitude −90…90.',
  'tool.tile-coords.errGeneric':
    'Tile calculation failed. Adjust the extent or zoom levels and try again.',

  /* ---------- T15 Map Preview ---------- */
  'tool.map-preview.fileTitle': 'Data file',
  'tool.map-preview.chooseFile': 'Choose files',
  'tool.map-preview.addFile': 'Add files',
  'tool.map-preview.formatLabel': 'File format',
  'tool.map-preview.formatAuto': 'Detect automatically',
  'tool.map-preview.formatHint':
    'If detection fails, pick the format on the left to parse the file again.',
  'tool.map-preview.supported':
    'GeoJSON, TopoJSON, KML/KMZ, GPX, CSV/TSV, Excel, Shapefile (ZIP), FlatGeobuf, GeoPackage, WKT, GML, DXF, MIF/MID and GMT.',
  'tool.map-preview.dataTitle': 'Loaded data',
  'tool.map-preview.fileCount': '{n} files',
  'tool.map-preview.totalFeatures': '{n} features in total',
  'tool.map-preview.removeFile': 'Remove this file',
  'tool.map-preview.empty':
    'No data yet. Pick one or more files to overlay them on the map and see per-file statistics here.',
  'tool.map-preview.statFormat': 'Format',
  'tool.map-preview.statFeatures': 'Features',
  'tool.map-preview.statTypes': 'Geometry types',
  'tool.map-preview.statIssues': 'Issues',
  'tool.map-preview.issuesValue': '{n} found',
  'tool.map-preview.warnings': '{n} additional parse notices',
  'tool.map-preview.loading': 'Parsing…',
  'tool.map-preview.clearData': 'Clear data',
  'tool.map-preview.errRead': 'The file could not be read. Please choose it again.',
  'tool.map-preview.errTooLarge': 'The file is larger than 20 MB. Crop or simplify it first.',
  'tool.map-preview.errUnknownFormat':
    'The format could not be recognised. Choose a format on the left and try again.',
  'tool.map-preview.errParse':
    'Parsing failed. The file may be damaged, incomplete, or not match the selected format.',
  'tool.map-preview.errNoCoords': 'The file contains no usable coordinates to show on the map.',
  'tool.map-preview.errCoordRange':
    'Coordinates are outside the longitude/latitude range (lng ±180, lat ±90). Check that the data is WGS84.',
  'tool.map-preview.errEmptyFile': 'The file is empty.',
  'tool.map-preview.errTooMany':
    'More than 50,000 features. Crop the extent before viewing.',

  /* ---------- T16 Clip & Overlay ---------- */
  'tool.clip-overlay.layerA': 'Layer A (input)',
  'tool.clip-overlay.layerB': 'Layer B (overlay)',
  'tool.clip-overlay.chooseFile': 'Choose a file',
  'tool.clip-overlay.changeFile': 'Change file',
  'tool.clip-overlay.noLayer': 'No file selected',
  'tool.clip-overlay.featuresCount': '{n} features',
  'tool.clip-overlay.parsing': 'Parsing…',
  'tool.clip-overlay.layerBSkip': 'This operation only uses layer A',
  'tool.clip-overlay.operation': 'Operation',
  'tool.clip-overlay.op.clip': 'Clip',
  'tool.clip-overlay.op.intersect': 'Intersect',
  'tool.clip-overlay.op.difference': 'Difference',
  'tool.clip-overlay.op.simplify': 'Simplify',
  'tool.clip-overlay.op.clipHint': 'Keep the part of layer A that falls inside layer B.',
  'tool.clip-overlay.op.intersectHint': 'Keep the area shared by layer A and layer B.',
  'tool.clip-overlay.op.differenceHint': 'Remove the area of layer A that overlaps layer B.',
  'tool.clip-overlay.op.simplifyHint':
    'Reduce the vertices of layer A. A smaller tolerance keeps more detail.',
  'tool.clip-overlay.tolerance': 'Tolerance (metres)',
  'tool.clip-overlay.run': 'Run',
  'tool.clip-overlay.running': 'Calculating…',
  'tool.clip-overlay.resultTitle': 'Result',
  'tool.clip-overlay.resultFeatures': 'Result features',
  'tool.clip-overlay.resultArea': 'Total area',
  'tool.clip-overlay.resultSkipped': 'Skipped',
  'tool.clip-overlay.download': 'Download GeoJSON',
  'tool.clip-overlay.clear': 'Clear',
  'tool.clip-overlay.privacy': 'Everything runs locally in your browser. Files are never uploaded.',
  'tool.clip-overlay.note':
    'Clip, intersect and difference work on polygons only; points and lines are skipped and counted under “Skipped”.',
  'tool.clip-overlay.errTooLarge': 'The file is larger than 20 MB. Crop or simplify it first.',
  'tool.clip-overlay.errUnknownFormat':
    'The format could not be detected. Convert the file to GeoJSON first.',
  'tool.clip-overlay.errTooMany': 'More than 50,000 features. Crop the extent first.',
  'tool.clip-overlay.errEmpty': 'The file is empty or has no usable features.',
  'tool.clip-overlay.errParse': 'Parsing failed. The file may be damaged or in another format.',
  'tool.clip-overlay.errNoResult':
    'The result is empty: the layers may not overlap, or they contain only points and lines.',
  'tool.clip-overlay.errGeneric': 'The operation failed. Check that both layers are valid.',
  'tool.clip-overlay.errNeedA': 'Choose layer A first.',
  'tool.clip-overlay.errNeedBoth': 'Clip, intersect and difference need both layer A and layer B.',

  /* ---------- T17 Extract by Attribute ---------- */
  'tool.attribute-extract.fileTitle': 'Data file',
  'tool.attribute-extract.chooseFile': 'Choose a file',
  'tool.attribute-extract.changeFile': 'Change file',
  'tool.attribute-extract.parsing': 'Parsing…',
  'tool.attribute-extract.noLayer': 'No file selected',
  'tool.attribute-extract.featuresCount': '{n} features',
  'tool.attribute-extract.layerLabel': 'Layer',
  'tool.attribute-extract.layerAll': 'All features',
  'tool.attribute-extract.layer.point': 'Point layer',
  'tool.attribute-extract.layer.line': 'Line layer',
  'tool.attribute-extract.layer.polygon': 'Polygon layer',
  'tool.attribute-extract.layer.other': 'Other',
  'tool.attribute-extract.conditionTitle': 'Filter',
  'tool.attribute-extract.fieldLabel': 'Field',
  'tool.attribute-extract.fieldPlaceholder': 'No attribute fields found',
  'tool.attribute-extract.sampleHint': '{field} samples: {values}',
  'tool.attribute-extract.operatorLabel': 'Condition',
  'tool.attribute-extract.op.eq': 'Equals',
  'tool.attribute-extract.op.neq': 'Does not equal',
  'tool.attribute-extract.op.contains': 'Contains',
  'tool.attribute-extract.op.gt': 'Greater than',
  'tool.attribute-extract.op.gte': 'Greater than or equal',
  'tool.attribute-extract.op.lt': 'Less than',
  'tool.attribute-extract.op.lte': 'Less than or equal',
  'tool.attribute-extract.op.empty': 'Is empty',
  'tool.attribute-extract.op.notEmpty': 'Is not empty',
  'tool.attribute-extract.valueLabel': 'Value',
  'tool.attribute-extract.valuePlaceholder': 'Value to match',
  'tool.attribute-extract.valueHint': '{n} existing values. Pick one or type your own.',
  'tool.attribute-extract.numericHint':
    'This field is not numeric, so greater/less conditions will not match anything.',
  'tool.attribute-extract.run': 'Extract',
  'tool.attribute-extract.running': 'Extracting…',
  'tool.attribute-extract.resultTitle': 'Result',
  'tool.attribute-extract.resultCount': '{matched} of {total} features matched',
  'tool.attribute-extract.download': 'Download GeoJSON',
  'tool.attribute-extract.clear': 'Clear',
  'tool.attribute-extract.privacy':
    'Everything runs locally in your browser. Files are never uploaded.',
  'tool.attribute-extract.errNeedFile': 'Choose a data file first.',
  'tool.attribute-extract.errNeedField': 'Choose the field to filter on.',
  'tool.attribute-extract.errNeedValue': 'Enter the value to match.',
  'tool.attribute-extract.errTooLarge': 'The file is larger than 20 MB. Crop or simplify it first.',
  'tool.attribute-extract.errUnknownFormat':
    'The format could not be detected. Convert the file to GeoJSON first.',
  'tool.attribute-extract.errTooMany': 'More than 50,000 features. Crop the extent first.',
  'tool.attribute-extract.errEmpty': 'The file is empty or has no usable features.',
  'tool.attribute-extract.errParse':
    'Parsing failed. The file may be damaged or in another format.',
  'tool.attribute-extract.errNoMatch': 'No features match. Adjust the condition or value.',
  'tool.attribute-extract.errGeneric': 'Extraction failed. Check that the data is valid.',

  /* ---------- Guides (P1 /guide/) ---------- */
  'guide.title': 'Guides: coordinate systems, projections and vector formats | GeoToolbox',
  'guide.description':
    'Plain-language guides to map projections, EPSG codes and vector formats, with links to the matching browser-based tools.',
  'guide.h1': 'Guides',
  'guide.group.projection': 'Coordinate systems & projections',
  'guide.group.vector': 'Vector data formats',
  'guide.group.tile': 'Map tiles',
  'guide.group.projection.desc':
    'What projections do, how EPSG codes work, and which one to pick.',
  'guide.group.vector.desc':
    'The 15 vector formats these tools read and write, and when to use each.',
  'guide.group.tile.desc':
    'XYZ tile numbering, zoom levels, and turning a bounding box into tile coordinates.',
  'guide.meta': '{articles} articles in {groups} groups',
  'guide.count': '{n} articles',
  'guide.jump': 'Jump to a group',
  'guide.lead':
    'Background reading for the concepts behind the tools: what a projection actually does, how to read EPSG codes, and which vector format to choose.',
  'guide.readMore': 'Read the guide',
  'guide.minutes': '{count} min read',
  'guide.updated': 'Updated {date}',

  /* ---------- T09 Map drawing ---------- */
  'tool.map-draw.h1': 'Online Map Drawing Tool',
  'tool.map-draw.lead':
    'Draw points, lines, polygons, rectangles and circles on the map, measure them, edit attributes, and export GeoJSON, KML, GPX, WKT or CSV. Everything stays in your browser.',
  'tool.map-draw.modeSelect': 'Select',
  'tool.map-draw.modePoint': 'Point',
  'tool.map-draw.modeLine': 'Line',
  'tool.map-draw.modePolygon': 'Polygon',
  'tool.map-draw.modeRect': 'Rectangle',
  'tool.map-draw.modeCircle': 'Circle',
  'tool.map-draw.dragModeTitle': 'Drag mode',
  'tool.map-draw.dragModeMap': 'Drag map',
  'tool.map-draw.dragModeVertex': 'Drag vertices',
  'tool.map-draw.vertexModeHint':
    'Drag-vertices mode is off. Switch to “Drag vertices” to adjust points.',
  'tool.map-draw.hint.select': 'Click a feature to select and edit it. Drag the map to move around.',
  'tool.map-draw.hint.point': 'Click the map to add a point. Consecutive clicks add independent points.',
  'tool.map-draw.hint.line': 'Click to add vertices. Double-click or press Enter to finish. Esc cancels.',
  'tool.map-draw.hint.polygon': 'Click to add vertices. Double-click or press Enter to close. Esc cancels.',
  'tool.map-draw.hint.rect': 'Press and drag from one corner to the opposite corner.',
  'tool.map-draw.hint.circle': 'Press at the centre and drag to set the radius.',
  'tool.map-draw.undo': 'Undo',
  'tool.map-draw.redo': 'Redo',
  'tool.map-draw.clearAll': 'Clear all',
  'tool.map-draw.clearConfirm': 'Delete all {count} features? You can undo this.',
  'tool.map-draw.confirmYes': 'Confirm',
  'tool.map-draw.confirmNo': 'Cancel',
  'tool.map-draw.featuresTitle': 'Features',
  'tool.map-draw.featuresEmpty': 'Nothing drawn yet. Pick a drawing mode above and click the map.',
  'tool.map-draw.unnamed': 'Unnamed {type}',
  'tool.map-draw.typePoint': 'Point',
  'tool.map-draw.typeLine': 'Line',
  'tool.map-draw.typePolygon': 'Polygon',
  'tool.map-draw.typeOther': 'Geometry',
  'tool.map-draw.statCount': '{count} features',
  'tool.map-draw.statLength': 'Total length',
  'tool.map-draw.statArea': 'Total area',
  'tool.map-draw.statTypes': 'Types',
  'tool.map-draw.delete': 'Delete',
  'tool.map-draw.propsTitle': 'Attributes',
  'tool.map-draw.nameLabel': 'Name',
  'tool.map-draw.descLabel': 'Description',
  'tool.map-draw.customTitle': 'Custom properties',
  'tool.map-draw.addProperty': 'Add property',
  'tool.map-draw.removeProperty': 'Remove',
  'tool.map-draw.keyPlaceholder': 'key',
  'tool.map-draw.valuePlaceholder': 'value',
  'tool.map-draw.propsEmptyKey': 'Property names cannot be empty.',
  'tool.map-draw.propsDuplicate': 'Property names must be unique.',
  'tool.map-draw.propsReserved': 'Property names such as type, coordinates, geometry and properties are reserved.',
  'tool.map-draw.importTitle': 'Append existing data',
  'tool.map-draw.importHint': 'Imported features are appended to the current map; nothing is cleared.',
  'tool.map-draw.importPlaceholder': 'Paste GeoJSON, KML, GPX, CSV or WKT…',
  'tool.map-draw.importButton': 'Append pasted data',
  'tool.map-draw.importFile': 'Choose a file',
  'tool.map-draw.imported': '{count} features appended.',
  'tool.map-draw.importEmpty': 'No features were found in that input.',
  'tool.map-draw.importFailed': 'The input could not be parsed. Check the format and try again.',
  'tool.map-draw.exportTitle': 'Export',
  'tool.map-draw.exportFormat': 'Format',
  'tool.map-draw.exportEmpty': 'Draw or import at least one feature to export.',
  'tool.map-draw.exportFailed': 'The export could not be generated. Try another format.',
  'tool.map-draw.gpxSkipped': '{count} polygon features were skipped because GPX cannot store polygons.',
  'tool.map-draw.shapefileBinaryNote':
    'Shapefile output is a binary ZIP (.shp/.shx/.dbf/.prj/.cpg) and cannot be previewed here. Open the download in QGIS or ArcGIS.',
  'tool.map-draw.draftPrefix': 'In progress:',
  'tool.map-draw.vertexHint':
    'This feature has {count} vertices. Precise editing is easier on a desktop.',
  'tool.map-draw.featuresWarn':
    'More than 2,000 features may slow down the map. Consider exporting and cleaning up in batches.',
  'tool.map-draw.finishDraftFirst':
    'Finish or cancel the current shape before switching drawing modes.',
  'tool.map-draw.needTwoPoints': 'A line needs at least two points.',
  'tool.map-draw.needThreePoints': 'A polygon needs at least three points.',
  'tool.map-draw.storageTitle': 'Local autosave',
  'tool.map-draw.restored':
    '{count} features were restored from this browser. Use “Clear local save” if you do not need them.',
  'tool.map-draw.clearStorage': 'Clear local save',
  'tool.map-draw.storageCleared': 'The local save has been cleared.',
  'tool.map-draw.storageFull':
    'Browser storage is full. Autosave is paused — export your work now.',

  /* ---------- FR-13 Batch ---------- */
  'batch.title': 'Batch processing',
  'batch.lead':
    'Upload a CSV/TSV or Excel file, map columns, preview a few rows, then append computed columns and download. The file stays in your browser.',
  'batch.desktopOnly': 'Desktop',
  'batch.chooseFile': 'Choose CSV/TSV/Excel',
  'batch.replaceFile': 'Choose another file',
  'batch.pasteLabel': 'Or paste CSV/TSV',
  'batch.pastePlaceholder': 'name,lng,lat\nA,116.3974,39.9088',
  'batch.limitHint': 'Up to 20 MB or 50,000 rows. UTF-8 by default; Excel reads the first worksheet.',
  'batch.xlsxHint': 'Excel mode: the first worksheet is read; encoding and delimiter are ignored.',
  'batch.xlsxSheet': 'Worksheet: {name}',
  'batch.encoding': 'Encoding',
  'batch.encUtf8': 'UTF-8',
  'batch.encGbk': 'GBK / GB18030',
  'batch.delimiter': 'Delimiter',
  'batch.delimAuto': 'Auto-detect',
  'batch.delimComma': 'Comma',
  'batch.delimTab': 'Tab',
  'batch.delimSemicolon': 'Semicolon',
  'batch.hasHeader': 'First row is a header',
  'batch.bom': 'Add UTF-8 BOM (Excel)',
  'batch.parseWarnings': '{count} parse warnings. Check the preview before running.',
  'batch.mappingTitle': 'Column mapping',
  'batch.mappingHint': 'Required columns are marked with *. Detection is a suggestion — confirm it.',
  'batch.notMapped': 'Not mapped',
  'batch.missingColumns': 'Map these required columns first:',
  'batch.optionsTitle': 'Options',
  'batch.formatTitle': 'Format settings',
  'batch.previewTitle': 'Preview (first 8 rows)',
  'batch.previewLoading': 'Calculating preview…',
  'batch.previewEmpty': 'Map the required columns to see a preview.',
  'batch.previewFailures': '{count} preview rows failed.',
  'batch.run': 'Run batch',
  'batch.running': 'Running…',
  'batch.cancel': 'Cancel',
  'batch.rowCount': '{count} data rows',
  'batch.cancelled': 'Cancelled. Completed rows are kept below.',
  'batch.resultTitle': 'Batch result',
  'batch.successCount': '{count} succeeded',
  'batch.failureCount': '{count} failed',
  'batch.download': 'Download result CSV',
  'batch.downloadFailed': 'Download failed rows',
  'batch.failuresTitle': 'Failed rows ({count})',
  'batch.colRow': 'Row',
  'batch.colReason': 'Reason',
  'batch.failuresMore': '{count} more failures are included in the downloaded file.',
  'batch.emptyBody': 'Paste or choose a CSV/TSV file to begin. Nothing is uploaded.',
  'batch.err.empty-table': 'No data rows were found.',
  'batch.err.too-large': 'The input is too large. Use a file of at most 20 MB.',
  'batch.err.too-many-rows': 'The file exceeds 50,000 data rows.',
  'batch.err.file-too-large': 'This file exceeds the 20 MB limit.',
  'batch.err.parse-failed': 'The table could not be parsed.',
  'batch.err.xlsx-load-failed': 'The Excel parser could not be loaded. Check your connection and retry.',
  'batch.err.xlsx-parse-failed': 'This .xlsx file could not be read.',
  'batch.err.xlsx-empty': 'The first worksheet is empty.',
  'batch.err.missing-columns': 'Required columns are not mapped.',
  'batch.err.prepare-failed': 'The calculation could not be initialised. Check the options.',
  'batch.err.run-failed': 'The batch could not be completed.',
  'batch.err.missing-value': 'Required value is missing',
  'batch.err.invalid-number': 'Not a valid number',
  'batch.err.not-finite': 'Result is not a finite number',
  'batch.err.convert-failed': 'Conversion failed',
  'batch.err.invalid-lng': 'Invalid longitude',
  'batch.err.invalid-lat': 'Invalid latitude',
  'batch.err.invalid-unit': 'Unknown unit code',
  'batch.err.invalid-date': 'Invalid date (use YYYY-MM-DD)',
  'batch.err.no-coordinate': 'No coordinate recognised',
  'batch.err.failed': 'Row failed',
  'batch.col.lng': 'Longitude',
  'batch.col.lat': 'Latitude',
  'batch.col.lngText': 'Longitude (text)',
  'batch.col.latText': 'Latitude (text)',
  'batch.col.x': 'X (longitude / easting)',
  'batch.col.y': 'Y (latitude / northing)',
  'batch.col.startLng': 'Start longitude',
  'batch.col.startLat': 'Start latitude',
  'batch.col.endLng': 'End longitude',
  'batch.col.endLat': 'End latitude',
  'batch.col.date': 'Date (optional)',
  'batch.out.decimalLng': 'Decimal longitude',
  'batch.out.decimalLat': 'Decimal latitude',
  'batch.out.dmsLng': 'DMS longitude',
  'batch.out.dmsLat': 'DMS latitude',
  'batch.out.outX': 'X (longitude / easting)',
  'batch.out.outY': 'Y (latitude / northing)',
  'batch.out.distanceM': 'Distance (m)',
  'batch.out.distanceKm': 'Distance (km)',
  'batch.out.bearingDeg': 'Initial bearing (°)',
  'batch.out.geohash': 'GeoHash',
  'batch.out.sunrise': 'Sunrise',
  'batch.out.sunset': 'Sunset',
  'batch.out.solarNoon': 'Solar noon',
  'batch.out.dayLengthMin': 'Day length (min)',
  'batch.out.polar': 'Polar state',
  'batch.out.lng': 'Longitude',
  'batch.out.lat': 'Latitude',
  'batch.opt.fromEpsg': 'Source EPSG',
  'batch.opt.toEpsg': 'Target EPSG',
  'batch.opt.precision': 'GeoHash precision (1–12)',
  'batch.opt.tzMinutes': 'Time zone offset (minutes)',
  'batch.col.coord': 'Coordinate (longitude, latitude)',
  'batch.opt.sourceFormat': 'Source format',
  'batch.opt.targetFormat': 'Target format',
  'batch.opt.coordPrecision': 'Decimal places (0–12)',
  'batch.format.auto': 'Detect automatically',
  'batch.format.decimal': 'Decimal degrees',
  'batch.format.dm': 'Degrees & minutes',
  'batch.format.dms': 'Degrees, minutes & seconds',
  'batch.err.invalid-coord':
    'The coordinate could not be parsed. Check the source format and the coordinate text.',

  /* ---------- Cookie consent（FR-10） ---------- */
  'cookie.aria': 'Cookie consent',
  'cookie.text':
    'We use necessary browser storage to remember your choice and your tool preferences. With your consent, we also load Google AdSense, which may set advertising cookies.',
  'cookie.acceptAll': 'Accept all',
  'cookie.necessary': 'Necessary only',
  'cookie.privacy': 'Privacy policy',
  'cookie.settings': 'Cookie settings',

  /* ---------- 语言缺失提示（FR-08） ---------- */
  'lang.notAvailable': 'This tool is not available in {lang} yet. Showing the {shown} version.'
} as const

/** 全部合法文案键的联合类型。zh / ja 字典必须逐一实现。 */
export type UiKey = keyof typeof en

export default en
