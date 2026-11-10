/**
 * 日本語文案
 *
 * 键集合必须与 en.ts 完全一致。日语版属第 2 批上线（M15），
 * 但 `Record<Lang, Record<UiKey, string>>` 的类型约束要求现在就补齐全 ——
 * 上线时只需改 config/i18n.ts 的 LAUNCHED 一行。
 *
 * scripts/check-i18n.ts 只强制校验 LAUNCHED 中的语言，
 * 因此本文件在 M15 之前的措辞仍可再润色，但不得留空或填英文占位。
 *
 * 术语注意：日本测绘不使用 UTM，法定坐标系为 JGD2011 + 平面直角座標系 19 区带。
 * 「座標」「測地系」「経度」「緯度」等汉字必须用日文字形渲染（SR-11）。
 */

import type { UiKey } from './en'

const ja: Record<UiKey, string> = {
  /* ---------- ナビゲーション ---------- */
  'nav.home': 'ホーム',
  'nav.allTools': 'ツール一覧',
  'nav.guide': '解説記事',
  'nav.about': 'このサイトについて',
  'nav.contact': 'お問い合わせ',
  'nav.privacy': 'プライバシーポリシー',
  'nav.disclaimer': '免責事項',
  'nav.cookieSettings': 'Cookie 設定',
  'nav.menu.open': 'メニューを開く',
  'nav.menu.close': 'メニューを閉じる',

  /* ---------- アクセシビリティ ---------- */
  'a11y.skip': '本文へスキップ',
  'a11y.mainNav': 'メインナビゲーション',
  'a11y.footerNav': 'フッターナビゲーション',
  'a11y.breadcrumb': 'パンくずリスト',
  'a11y.langSwitch': '言語を切り替える',
  'a11y.tool': 'ツール',
  'a11y.result': '計算結果',
  'a11y.related': '関連ツール',
  'a11y.advertisement': '広告',
  'a11y.search': 'ツールを検索',
  'a11y.siteHome': 'ジオツールボックス ホーム',

  /* ---------- 共通操作 ---------- */
  'common.convert': '変換',
  'common.calculate': '計算',
  'common.copy': 'コピー',
  'common.copied': 'コピーしました',
  'common.copyFailed': 'コピーできませんでした。テキストを選択して手動でコピーしてください',
  'common.share': 'リンクを共有',
  'common.shared': 'リンクをコピーしました',
  'common.download': 'ダウンロード',
  'common.cancel': 'キャンセル',
  'common.reset': 'リセット',
  'common.clear': 'クリア',
  'common.advanced': '詳細オプション',
  'common.loading': '計算中…',
  'common.close': '閉じる',
  'common.optional': '任意',
  'common.required': '必須',
  'common.tryExample': 'サンプルを読み込む',
  'common.backToTools': 'ツール一覧を見る',
  'common.allTools': 'ツール一覧',
  'common.batch': '一括処理',
  'common.batchHint': 'CSV/TSV ファイルをアップロードして複数行をまとめて処理できます。',
  'common.desktopRecommended': 'このツールはパソコンでの利用が快適ですが、スマートフォンでも全機能をお使いいただけます。',
  /* FR-05：共有ボタンの横に常駐する注意書き */
  'common.shareWarning': 'リンクには入力した内容がすべて含まれます。機密性の高い座標は共有しないでください。',
  'common.shareTooLarge': 'データが大きすぎるためリンクで共有できません。ファイルをダウンロードして送信してください。',
  'common.shareReset': 'リンクのパラメータを解釈できなかったため、初期状態に戻しました。',
  'common.swap': '入れ替え',

  /* ---------- 座標入力 ---------- */
  'coord.lng': '経度',
  'coord.lat': '緯度',
  'coord.lngLat': '経度, 緯度',
  'coord.pairPlaceholder': '116.3974, 39.9088',
  'coord.height': '標高',
  'coord.source': '変換元の座標系',
  'coord.target': '変換先の座標系',
  'coord.precision': '小数点以下の桁数',
  'coord.start': '始点',
  'coord.end': '終点',
  'coord.useMyLocation': '現在地を使う',
  'coord.locating': '位置情報を取得中…',
  'coord.locationDenied': '位置情報を取得できません。座標を手動で入力してください。',
  'coord.accuracy': 'GPS 精度 ±{r} m',
  /* SR-01 規則 ⑤：カンマの意味の手動上書き。選択肢には例を添える */
  'coord.commaMeaning': 'カンマの意味',
  'coord.comma.auto': '自動判定',
  'coord.comma.separator': '区切り —— 116.3974, 39.9088',
  'coord.comma.decimal': '小数点 —— 116,3974',
  'coord.comma.hint': 'データがカンマを小数点として使っている場合のみ変更してください。',

  /* ---------- プライバシー表示（SR-07 常駐） ---------- */
  'privacy.notice': 'すべての計算はお使いのブラウザ内で行われます。データがサーバーに送信されることはありません。',

  /* ---------- エラー表示（SR-06 三段構成） ---------- */
  'err.empty.title': '入力待ち',
  'err.empty.hint': '座標を入力するか、サンプルを読み込んで動作をご確認ください。',
  'err.parse.title': 'この座標を解釈できませんでした',
  'err.parse.hint': '10進度・度分秒・GeoHash 文字列のいずれかの形式で入力してください。',
  'err.lng.range': '経度が範囲外です。',
  'err.lng.range.hint': '有効範囲は −180 から +180 です。経度と緯度を入れ替えていないかご確認ください。',
  'err.lat.range': '緯度が範囲外です。',
  'err.lat.range.hint': '有効範囲は −90 から +90 です。経度と緯度を入れ替えていないかご確認ください。',
  'err.number': '小数点をピリオドで表した数値を入力してください（例：116.3974）',
  'err.file.tooLarge': 'ファイルが大きすぎます（{actual} > {limit}）。',
  'err.file.type': '対応していないファイル形式です。{expected} を選択してください。',
  'err.generic': '計算中に問題が発生しました。入力内容は保持されています。',

  /* ---------- ホームと索引 ---------- */
  'home.h1': 'ブラウザの外に出ない地理情報ツール',
  'home.intro':
    '座標・投影・ベクター形式に対応した 11 のツール。登録もアップロードも不要で、すべての計算はお手元のデバイス上で完結します。',
  'home.section.tools': 'ツール一覧',
  'home.section.why': 'このサイトの特徴',
  'home.why.local': 'データは送信されません。区画境界や位置情報は端末内に留まります。',
  'home.why.fast': '静的ページなので待ち時間がなく、入力と同時に結果が表示されます。',
  'home.why.shareable': 'すべての結果は同じ入力を再現できる共有リンクにできます。',
  'home.toolCount': '全 {n} ツール',
  'home.openTool': 'ツールを開く',
  'home.section.guides': '関連解説',
  'home.guides.all': 'すべての解説',

  /* ---------- Cookie の同意（FR-10） ---------- */
  'cookie.title': 'Cookie の設定',
  'cookie.body':
    '設定を記憶するために必要なストレージのみを使用しています。同意いただいた場合、Google AdSense によるパーソナライズ広告を表示します。同意しなくてもツールの動作に影響はありません。',
  'cookie.accept': 'すべて同意',
  'cookie.reject': '必須のみ',
  'cookie.purpose.necessary': '必須 —— 言語・精度・レイアウトの設定を記憶します。常に有効です。',
  'cookie.purpose.ads': '広告 —— Google AdSense が提供するパーソナライズ広告。',

  /* ---------- ドキュメント領域 ---------- */
  'doc.onThisPage': 'このページの内容',
  'doc.related': '関連ツール',
  'doc.faq': 'よくある質問',
  'doc.howItWorks': '使い方',
  'doc.moreInGroup': '同じ分類の記事',

  /* ---------- フッター ---------- */
  'footer.rights': '© {year} {site}。すべての計算はブラウザ内で実行されます。',
  'footer.noAccount': 'アカウント不要・アップロード不要・データ追跡なし。',

  /* ---------- T01 座標系変換 ----------
     SEO の <title> と meta description はドキュメントの frontmatter に置く */
  'tool.coord-convert.h1': 'WGS84 / CGCS2000 座標系変換',
  'tool.coord-convert.lead': 'WGS84 と CGCS2000 の相互変換。実用精度では両者は等価です。',
  'tool.coord-convert.identity': '変換元と変換先の座標系が同じため、値はそのまま返されます。',
  'tool.coord-convert.cgcs2000': 'CGCS2000 はここでは WGS84 と等価として扱います。両者の差はセンチメートル程度です。',
  'tool.coord-convert.allTargets': 'すべての変換先座標系',
  'tool.coord-convert.precisionNote': 'WGS84 と CGCS2000 の楕円体パラメータの差はセンチメートル未満で、本ツールは等価として扱い、オフセットは適用しません。',

  /* ---------- T02 経度緯度の形式変換 ----------
     SEO の <title> と meta description はドキュメントの frontmatter に置く。
     {name} / {value} を含むキーはコンポーネント側で文字列置換する */
  'tool.dms-decimal.h1': '度分秒 ↔ 10進数 経度緯度の形式変換',
  'tool.dms-decimal.lead': '経度と緯度の組を貼り付け、元の形式と出力形式を選ぶだけで変換できます。',
  'tool.dms-decimal.sourceFormat': '元の形式',
  'tool.dms-decimal.targetFormat': '出力形式',
  'tool.dms-decimal.format.auto': '自動判定',
  'tool.dms-decimal.target.dmsSymbolic': '度分秒（記号形式）',
  'tool.dms-decimal.target.dmsTextual': '度分秒（テキスト形式）',
  'tool.dms-decimal.coordHint':
    '経度が先、緯度が後です。1 行に 1 組、複数行まとめて貼り付けられます。',
  'tool.dms-decimal.lineError': '{n} 行目：{message}',
  'tool.dms-decimal.errFormat': '入力が選択した元の形式（{name}）と一致しません。',
  'tool.dms-decimal.errFormatHint':
    '元の形式を「自動判定」に変更するか、選択した形式で座標を書き直してください。',
  'tool.dms-decimal.needBoth': '経度と緯度の両方を入力してください。',
  'tool.dms-decimal.needBothHint': 'カンマで区切ります（例：116.3974, 39.9088）。',
  /* SR-01 規則 ④：解釈結果を必ず表示し、誤判定を利用者に見えるようにする */
  'tool.dms-decimal.detected': '解釈',
  'tool.dms-decimal.name.decimal': '10進度',
  'tool.dms-decimal.name.dm': '度分',
  'tool.dms-decimal.name.dms': '度分秒',
  /* 度分秒の 2 つの書き方（PRD T02）。形式名と組み合わせて 1 行のラベルにする */
  'tool.dms-decimal.symbolic': '記号形式',
  'tool.dms-decimal.textual': 'テキスト形式',
  // ⚠️ 正規化は黙って行わない（PRD T02：「結果に入力を正規化した旨を表示」）。
  // 分と秒は繰り上げ先が違うため、別々の文にする。
  'tool.dms-decimal.normalized.seconds': '秒の値が 60 以上だったため、分に繰り上げて正規化しました。',
  'tool.dms-decimal.normalized.minutes': '分の値が 60 以上だったため、度に繰り上げて正規化しました。',
  /* PRD T02 固有の例外②：片側だけの変換は正常な使い方であり、エラーではない */
  'tool.dms-decimal.notProvided': '未入力',
  /* PRD T02 固有の例外①：10進度として処理しつつ、別の解釈も示して確認を促す */
  'tool.dms-decimal.alternative': '{name} として解釈することもできます。その場合の結果は {value} です。どちらの意味かご確認ください。',
  'tool.dms-decimal.partialHint': '2 つの欄は片方だけでも使えます。未入力の方はエラーにならず「未入力」と表示されます。',
  'tool.dms-decimal.precisionNote':
    '小数点以下の桁数は 3 形式すべての小数部に適用されます。目安：10進度の小数第 8 位は約 1 mm、1 秒は約 31 m、0.01 秒は約 0.3 m です。',

  /* ---------- T03 投影座標変換（EPSG） ---------- */

  /* ---------- T03 投影座標変換（EPSG） ---------- */
  'tool.epsg-convert.h1': '投影座標変換（EPSG）',
  'tool.epsg-convert.lead':
    '任意の 2 つの EPSG 座標系の間で座標を変換します。WGS 84、UTM、Web メルカトル、中国のガウス・クリューゲル 3°/6° 帯、日本の平面直角座標系 19 区をカバーします。すべてブラウザ内で計算します。',
  'tool.epsg-convert.coordHint':
    '変換元座標系の座標を入力してください。地理座標系は 10 進度、投影座標系はメートルです。4,420,000 のような桁区切りも使用できます。',
  'tool.epsg-convert.customCode': 'EPSG コード',
  'tool.epsg-convert.customCodeHint':
    '6669 や 4548 など、数字のコードを入力してください。',
  'tool.epsg-convert.invalidCode': '有効な正の EPSG コード（数字のみ）を入力してください。',
  'tool.epsg-convert.errNotFound':
    'その EPSG コードの投影定義が見つかりませんでした。別のコードを試すか、よく使う一覧から選んでください。',
  'tool.epsg-convert.errNumber': '数値を入力してください。',
  'tool.epsg-convert.errGeoRange':
    '経度は −180〜180、緯度は −90〜90 の範囲で入力してください。',
  'tool.epsg-convert.errNeedBoth': '結果を表示するには座標を両方入力してください。',
  'tool.epsg-convert.errGeneric':
    '座標を変換できませんでした。変換元の座標系と値を確認してください。',
  'tool.epsg-convert.autoNeedGeo':
    '自動ゾーンの決定には経度が必要です。地理座標系を選ぶか、先に経度を入力してください。',
  'tool.epsg-convert.japanUtmRange':
    'JGD2011 / UTM はゾーン 51〜55（日本）でのみ定義されています。WGS 84 の UTM ゾーンか平面直角座標系を選んでください。',
  'tool.epsg-convert.loadingFull': 'EPSG の全一覧を読み込んでいます…',
  'tool.epsg-convert.loadFailed':
    'EPSG の全一覧を読み込めませんでした。接続を確認して再試行するか、よく使う一覧から選んでください。',
  'tool.epsg-convert.axisNoteJapan':
    '日本の平面直角座標系は X が北座標、Y が東座標で、GIS の慣例とは逆です。1 つ目の欄に北座標（X）を入力してください。',
  'tool.epsg-convert.axisNoteXY':
    'X は東座標、Y は北座標です（GIS の慣例）。原点より西・南では負の値も有効です（日本の平面直角座標系を含む）。',
  'tool.epsg-convert.eastX': 'X（東座標）',
  'tool.epsg-convert.northY': 'Y（北座標）',
  'tool.epsg-convert.northX': 'X（北座標）',
  'tool.epsg-convert.eastY': 'Y（東座標）',
  'tool.epsg-convert.xLongitude': 'X（経度）',
  'tool.epsg-convert.yLatitude': 'Y（緯度）',
  'tool.epsg-convert.swapXY': 'X と Y を入れ替え',
  'tool.epsg-convert.swapWarning':
    '値が入れ替わっている可能性があります。X が百万単位なのに Y が小さい値です。GIS の慣例では X が東座標、Y が北座標です。入れ替えて結果を確認してください。',
  'tool.epsg-convert.magnitudeWarning':
    '経度と緯度のような値です。投影座標は通常メートル単位で、もっと大きな値になります。',
  'tool.epsg-convert.resultTitle': '変換結果',
  'tool.epsg-convert.colSource': '変換元の座標系',
  'tool.epsg-convert.colTarget': '変換先の座標系',
  'tool.epsg-convert.datumShift': '測地系変換',
  'tool.epsg-convert.shift.none': '不要（同一測地系または WGS 84 互換）',
  'tool.epsg-convert.shift.7param': '簡易 7 パラメータ変換（精度約 1〜5 m）',
  'tool.epsg-convert.shift.missing': 'パラメータなし',
  'tool.epsg-convert.shift.custom': 'カスタム 7 パラメータ',
  'tool.epsg-convert.missingWarning':
    'この組み合わせに使える測地系変換パラメータがないため、未変換のままでは数メートル以上の誤差が出ます。明示的に続行するまで結果は表示しません。JGD2000 ↔ JGD2011 には日本のセミダイナミック補正、西安 1980 には公式パラメータが必要ですが、本サイトはいずれも提供していません。',
  'tool.epsg-convert.allowMissing': '測地系変換なしで続行（数メートルの誤差が出る場合があります）',
  'tool.epsg-convert.custom7': 'カスタム 7 パラメータ変換を使う',
  'tool.epsg-convert.custom7Hint':
    'Bursa-Wolf パラメータ：dx・dy・dz はメートル、rx・ry・rz は秒、スケールは ppm。変換元の座標系に適用します。',
  'tool.epsg-convert.custom7Incomplete': '3 個または 7 個の数値を入力してください。',
  'tool.epsg-convert.dx': 'dx（m）',
  'tool.epsg-convert.dy': 'dy（m）',
  'tool.epsg-convert.dz': 'dz（m）',
  'tool.epsg-convert.rx': 'rx（″）',
  'tool.epsg-convert.ry': 'ry（″）',
  'tool.epsg-convert.rz': 'rz（″）',
  'tool.epsg-convert.scale': 'スケール（ppm）',
  'tool.epsg-convert.centralMeridian': '中央経線：{value}',
  'tool.epsg-convert.utmZone': 'UTM ゾーン：{value}',
  'tool.epsg-convert.emptyTitle': 'EPSG 座標系の間で変換',
  'tool.epsg-convert.emptyBody':
    '変換元と変換先の座標系を選び、座標を入力してください。たとえば WGS 84 の経度・緯度を UTM やガウス・クリューゲルのグリッドに変換できます。',
  'tool.epsg-convert.copyPair': 'X, Y をコピー',
  'tool.epsg-convert.identity': '変換元と変換先が同じ座標系のため、値はそのまま返されます。',
  'tool.epsg-convert.precisionNote1':
    '測地系変換は簡易 7 パラメータ（Bursa-Wolf）モデルを使用し、精度は約 1〜5 m です。',
  'tool.epsg-convert.precisionNote2':
    'エポック補正（日本のセミダイナミック補正やプレート運動）は行わないため、高精度測量には適しません。',
  'tool.epsg-convert.precisionNote3': '結果は法的な測量基準ではありません。',

  /* ---------- T08 GeoHash エンコード / デコード ----------
     <title> と meta description はドキュメントの frontmatter に置く。
     {n} / {char} / {alphabet} / {p} はコンポーネントが t() と同じく
     リテラル置換で埋め込む。 */
  'tool.geohash.h1': 'GeoHash エンコード / デコード',
  'tool.geohash.lead':
    '座標を短い GeoHash 文字列に変換し、また座標に戻します。デコードではセル中心・境界ボックス・地上サイズ・周囲 8 セルを表示します。',
  'tool.geohash.mode': '変換の方向',
  'tool.geohash.mode.encode': '座標 → GeoHash',
  'tool.geohash.mode.decode': 'GeoHash → 座標',
  'tool.geohash.encodeHint': '10 進度で座標を入力します。GeoHash の長さがセルの大きさを決めます。',
  'tool.geohash.decodeHint': '大文字・小文字は区別しません。1〜12 桁を受け付けます。',
  'tool.geohash.precision': 'GeoHash の長さ',
  'tool.geohash.precisionHint': '1〜12 桁。7 桁で約 150 m 四方です。',
  'tool.geohash.hash': 'GeoHash 文字列',
  'tool.geohash.hashHint':
    '数字 0-9 と英字 b c d e f g h j k m n p q r s t u v w x y z のみを使います。a・i・l・o は規格上除外されています。',
  /* SR-06 の三段構成：何が起きたか、なぜか、どう直すか */
  'tool.geohash.errNumber': 'この座標を数値として読み取れません。',
  'tool.geohash.errNumberHint':
    '数字、小数点としてのピリオド 1 つ、先頭のマイナス記号だけを使えます。データが小数点にカンマを使っている場合は、詳細オプションでカンマの意味を変更してください。',
  'tool.geohash.needBoth': '経度と緯度の両方を入力すると GeoHash に変換できます。',
  /* PRD T08 固有の例外②：桁数超過は丸めて知らせる */
  'tool.geohash.hashTooLong': '入力が 12 桁を超えています。先頭 12 桁だけを使います。',
  'tool.geohash.precisionClamped': '長さを {p} 桁に丸めました。GeoHash は 1〜12 桁です。',
  /* PRD T08 固有の例外①：何文字目のどの文字かを示す */
  'tool.geohash.errIllegal': '{n} 文字目の「{char}」は GeoHash の文字として使えません。',
  'tool.geohash.errIllegalHint':
    'GeoHash で使えるのは 0-9 と b c d e f g h j k m n p q r s t u v w x y z だけです。a・i・l・o は 1・0・I と紛らわしいため規格で除外されています。',
  'tool.geohash.errAlphabet': '使用できる文字：{alphabet}',
  'tool.geohash.result.hash': 'GeoHash 文字列',
  'tool.geohash.result.center': '中心点',
  'tool.geohash.result.sw': '南西端（SW）',
  'tool.geohash.result.ne': '北東端（NE）',
  'tool.geohash.result.size': 'おおよその地上サイズ',
  'tool.geohash.result.precision': '精度（桁数）',
  'tool.geohash.result.neighbors': '隣接セル',
  'tool.geohash.gridCenter': '現在のセル',
  'tool.geohash.gridHint': '隣接する GeoHash を選ぶと、デコードの入力欄に入ります。',
  /* SR-12：近似値を正確な値に見せない */
  'tool.geohash.sizeNote':
    '経度方向のサイズは赤道上で計算した値です。赤道から離れると実際の幅は緯度のコサインだけ縮みます。',
  'tool.geohash.precisionTable': '精度の対応表（1〜12 桁）',
  'tool.geohash.col.precision': '桁数',
  'tool.geohash.col.lngError': '経度の誤差 ±（度）',
  'tool.geohash.col.latError': '緯度の誤差 ±（度）',
  'tool.geohash.col.size': 'おおよそのセルサイズ',
  'tool.geohash.current': '現在',
  /* SR-03：精度の根拠をツール内に常時表示する */
  'tool.geohash.precisionNote':
    'デコード結果はセルの中心点です。GeoHash は点ではなく面を表し、同じ文字列が境界ボックス内のすべての位置を含みます。',
  /* 8 方向の名前はコンポーネントの DIR_KEY 表から引く。
     ⚠️ 8 つすべてを揃えること。欠けると九宮格のそのマスが undefined になる */
  'tool.geohash.dir.n': '北',
  'tool.geohash.dir.ne': '北東',
  'tool.geohash.dir.e': '東',
  'tool.geohash.dir.se': '南東',
  'tool.geohash.dir.s': '南',
  'tool.geohash.dir.sw': '南西',
  'tool.geohash.dir.w': '西',
  'tool.geohash.dir.nw': '北西',

  /* ---------- T06 ベクタ形式変換 ---------- */
  'tool.format-convert.h1': 'ベクタ形式変換',
  'tool.format-convert.lead':
    'GeoJSON、KML/KMZ、GPX、CSV/TSV、TopoJSON、WKT を相互変換します。ファイルはブラウザ内だけで読み込まれ、アップロードされません。',
  'tool.format-convert.modeFile': 'ファイルを選択',
  'tool.format-convert.modePaste': 'テキストを貼り付け',
  'tool.format-convert.sourceLabel': '元の形式',
  'tool.format-convert.sourceAuto': '自動判定',
  'tool.format-convert.privacyNote':
    'ファイルは現在のタブ内でのみ読み込まれ、アップロードされません。ページを閉じると破棄されます。',
  'tool.format-convert.dropTitle': 'ベクタデータのファイルをここにドロップ',
  'tool.format-convert.dropHint': 'GeoJSON、KML、KMZ、GPX、CSV/TSV、TopoJSON、WKT、Shapefile ZIP',
  'tool.format-convert.shapefileHint':
    'Shapefile は .shp/.dbf/.shx/.prj を ZIP にまとめてからアップロードしてください。最初のレイヤーのみ読み込みます。',
  'tool.format-convert.chooseFile': 'ファイルを選択',
  'tool.format-convert.replaceFile': '別のファイルを選択',
  'tool.format-convert.encoding': 'ファイルの文字コード',
  'tool.format-convert.encUtf8': 'UTF-8（既定）',
  'tool.format-convert.encGbk': 'GBK / GB18030（中国語の旧形式）',
  'tool.format-convert.limitHint': '1 ファイル最大 20 MB、50,000 フィーチャまで。',
  'tool.format-convert.pasteLabel': 'ベクタデータを貼り付け',
  'tool.format-convert.pasteHint': '最大 200,000 文字。形式は内容から自動判別します。',
  'tool.format-convert.pastePlaceholder': 'GeoJSON、KML、GPX、CSV、TopoJSON、WKT を貼り付け…',
  'tool.format-convert.errCsvColumns':
    '経度・緯度の列を特定できませんでした。下で手動選択してください。推測は行いません。',
  'tool.format-convert.errCsvEmpty': 'この CSV にはヘッダー行がありません。',
  'tool.format-convert.csvLat': '緯度の列',
  'tool.format-convert.csvLng': '経度の列',
  'tool.format-convert.csvChoose': '列を選択',
  'tool.format-convert.parsedTitle': '読み込み結果',
  'tool.format-convert.summaryCount': '{count} フィーチャ',
  'tool.format-convert.summaryVertices': '{count} 頂点',
  'tool.format-convert.summaryTypes': 'ジオメトリ型',
  'tool.format-convert.summaryProps': '属性',
  'tool.format-convert.crsWarning':
    '座標系の変換は行いません。WGS 84 以外のデータは位置がずれる可能性があります。先に投影座標変換ツールで変換してください。',
  'tool.format-convert.issuesTitle': '{count} 件の問題',
  'tool.format-convert.issueFeature': 'フィーチャ {index}',
  'tool.format-convert.issueEmpty': '空のジオメトリ',
  'tool.format-convert.issueRange': '座標が −180…180 / −90…90 の範囲外',
  'tool.format-convert.issueRing': 'ポリゴンのリングが閉じていないか点数不足',
  'tool.format-convert.issueInvalid': 'ジオメトリを解析できません',
  'tool.format-convert.issueRow': '緯度経度がないため行をスキップ',
  'tool.format-convert.featurePreview': '先頭 20 フィーチャ',
  'tool.format-convert.colIndex': '番号',
  'tool.format-convert.colType': '種類',
  'tool.format-convert.colName': '名前',
  'tool.format-convert.targetLabel': '出力形式',
  'tool.format-convert.sameFormatNote':
    '入力と出力が同じ形式です。今回は整形と検証として処理します。',
  'tool.format-convert.optIndent': 'インデント整形',
  'tool.format-convert.optDigits': '座標の小数桁（0〜12）',
  'tool.format-convert.optRemoveEmpty': '空の属性を削除',
  'tool.format-convert.optGpxAttrs': 'GPX の属性処理',
  'tool.format-convert.gpxAttrsDesc': 'name と desc を残し、他の属性は説明にまとめる',
  'tool.format-convert.gpxAttrsName': 'name のみ残す',
  'tool.format-convert.unsupportedBody':
    '{count} フィーチャが GPX で保存できないジオメトリ型（{types}）です。処理方法を選択してください。',
  'tool.format-convert.unsupportedSkip': 'これらのフィーチャをスキップして変換',
  'tool.format-convert.unsupportedCancel': 'キャンセルして別の形式を選ぶ',
  'tool.format-convert.resultTitle': '変換結果',
  'tool.format-convert.previewLimited':
    'プレビューは先頭 {lines} 行のみです。ダウンロードは完全な結果です。',
  'tool.format-convert.warnNullGeometry': 'ジオメトリが null のフィーチャはスキップしました。',
  'tool.format-convert.emptyTitle': 'ベクタデータの形式を変換',
  'tool.format-convert.emptyBody':
    'ファイルを選択するかデータを貼り付けて、GeoJSON、KML、GPX、CSV、TopoJSON、WKT の間で変換します。',
  'tool.format-convert.errFileSize':
    'ファイルは {size} で、上限 {limit} を超えています。データを分割してください。',
  'tool.format-convert.errFeatureLimit':
    '入力は {count} フィーチャで、上限 {limit} を超えています。分割してください。',
  'tool.format-convert.errPasteLimit':
    '貼り付けたテキストが {limit} 文字を超えています。ファイルを選択してください。',
  'tool.format-convert.errParse':
    '入力を解析できません。ファイルが途中で切れていないか、拡張子と形式が一致しているか確認してください。',
  'tool.format-convert.errNoFeatures':
    '変換できる地理フィーチャが見つかりません。CSV の場合は緯度・経度の列に値があるか確認してください。',
  'tool.format-convert.errSerialize': '出力を生成できません。別の形式を試してください。',
  'tool.format-convert.errInvalidJson': 'JSON が不正です。',
  'tool.format-convert.errInvalidGeojson': 'GeoJSON の構造が不正です。',
  'tool.format-convert.errInvalidTopojson': 'TopoJSON の構造が不正です。',
  'tool.format-convert.errInvalidXml': 'XML が不正か、途中で切れています。',
  'tool.format-convert.errInvalidKmz': 'KMZ アーカイブを開けませんでした。',
  'tool.format-convert.errKmzNoKml': 'KMZ に KML ファイルが含まれていません。',
  'tool.format-convert.errKmzNeedsFile': 'KMZ はファイルとして選択してください。貼り付けはできません。',
  'tool.format-convert.errUnknownFormat':
    '形式を判別できません。対応入力：GeoJSON、KML、KMZ、GPX、CSV/TSV、XLSX、GML、DXF、GMT、TopoJSON、WKT。',
  'tool.format-convert.errDom':
    'このブラウザ環境では XML を解析できません。デスクトップ版のブラウザをお試しください。',
  'tool.format-convert.errShapefileZip': 'ZIP アーカイブを開けませんでした。',
  'tool.format-convert.errShapefileNoShp':
    'ZIP 内に .shp がありません。.shp/.dbf/.shx/.prj をまとめて圧縮してください。',
  'tool.format-convert.errShapefileParse':
    'Shapefile を解析できませんでした。ZIP 内の .shp が破損していないか確認してください。',
  'tool.format-convert.errShapefileEmpty':
    'Shapefile に書き出せるジオメトリがありません。',
  'tool.format-convert.errXlsx':
    'Excel ファイルを読み込めません。.xlsx または .xls で、先頭シートに経度・緯度の列があるか確認してください。',
  'tool.format-convert.errInvalidGml':
    'GML を解析できません。gml:featureMember を含むシンプルフィーチャ GML か確認してください。',
  'tool.format-convert.errInvalidDxf':
    'DXF を解析できません。ENTITIES セクションを含む ASCII DXF か確認してください。',
  'tool.format-convert.errInvalidMif':
    'MIF を解析できません。Data セクションを含む MIF、または .mif を含む ZIP か確認してください。',
  'tool.format-convert.mifBinaryNote':
    'MIF/MID 出力は data.mif と data.mid を含む ZIP のため、ページ内でプレビューできません。解凍して MapInfo や QGIS で開いてください。',
  'tool.format-convert.kmzBinaryNote':
    'KMZ 出力は doc.kml を含む ZIP のため、ページ内でプレビューできません。Google Earth や QGIS で開いてください。',
  'tool.format-convert.warnMifEmpty': 'MIF に書き出せるジオメトリがありません。',
  'tool.format-convert.warnMifRows':
    'MID の行数（{rows}）と MIF のオブジェクト数（{objects}）が一致しません。不足する属性は空になります。',
  'tool.format-convert.shapefileBinaryNote':
    'Shapefile 出力はバイナリ ZIP（.shp/.shx/.dbf/.prj/.cpg）のため、ページ内でプレビューできません。ダウンロード後に QGIS や ArcGIS で開いてください。',
  'tool.format-convert.xlsxBinaryNote':
    'Excel 出力はバイナリ形式のため、ページ内でプレビューできません。ダウンロード後に Excel・LibreOffice・WPS で開いてください。',
  'tool.format-convert.warnDxfCrs':
    'DXF は地理座標系を宣言していないため、座標をそのまま扱います。投影座標の場合は先に EPSG 変換をお使いください。',
  'tool.format-convert.warnDxfAttrs':
    'DXF の基本エンティティは属性を保持できないため、{count} 件の属性を破棄しました。',
  'tool.format-convert.warnGmtHoles':
    'GMT のプレーンテキストではポリゴンの内環を表現できないため、{count} 件の内環を破棄しました。',
  'tool.format-convert.warnGmlCrs':
    'GML は {crs} を宣言しています。本ツールは再投影しないため、座標をそのまま扱います。',
  'tool.format-convert.warnShapefilePrj': '.prj を検出したため、WGS 84 に再投影しました。',
  'tool.format-convert.warnShapefileNoPrj':
    '.prj がないため、座標を WGS 84 として扱いました。',
  'tool.format-convert.warnShapefileMulti':
    'ZIP 内に {count} 個のレイヤーがあり、最初の 1 つだけを変換しました。',
  'tool.format-convert.warnShapefileSkipped':
    'Shapefile に保存できないジオメトリのフィーチャ {count} 件をスキップしました。',
  'tool.format-convert.warnShapefileFieldRenamed':
    'DBF の 10 文字制限に合わせて、一部のフィールド名を短縮または変更しました。',
  'tool.format-convert.warnShapefileFieldsDropped':
    'DBF は最大 255 フィールドのため、{count} 個の属性フィールドを破棄しました。',
  'tool.format-convert.errInvalidFgb':
    'FlatGeobuf を解析できません。破損していない .fgb ファイルか確認してください。',
  'tool.format-convert.errFgbNeedsFile':
    'FlatGeobuf はバイナリ形式のため、貼り付けたテキストからは復元できません。「ファイル」モードで .fgb をアップロードしてください。',
  'tool.format-convert.errInvalidGpkg':
    'GeoPackage を解析できません。gpkg_contents を含む SQLite データベースか確認してください。',
  'tool.format-convert.errGpkgNeedsFile':
    'GeoPackage はバイナリデータベースのため、貼り付けたテキストからは復元できません。「ファイル」モードで .gpkg をアップロードしてください。',
  'tool.format-convert.errGpkgNoLayer':
    'GeoPackage にフィーチャレイヤーがありません（gpkg_contents が空です）。',
  'tool.format-convert.fgbBinaryNote':
    'FlatGeobuf 出力はバイナリのため、ページ内でプレビューできません。ダウンロード後に QGIS、GDAL、または FGB 対応の Web コンポーネントで開いてください。',
  'tool.format-convert.gpkgBinaryNote':
    'GeoPackage 出力は SQLite データベース（単一レイヤー features、EPSG:4326）のため、ページ内でプレビューできません。ダウンロード後に QGIS、GDAL、または任意の SQLite ツールで開いてください。',
  'tool.format-convert.warnFgbAttrs':
    'FGB の列型は先頭フィーチャーから推測されるため、{count} 個の値をテキストに統一しました。',
  'tool.format-convert.warnGpkgMulti':
    'GeoPackage 内に {count} 個のフィーチャレイヤーがあり、最初の 1 つだけを変換しました。',
  'tool.format-convert.warnGpkgCrs':
    'GeoPackage は EPSG:{srid} を宣言しています。本ツールは投影変換を行わないため、座標はそのまま扱います。',
  'tool.format-convert.warnGpkgGeometrySkipped':
    '{count} 個のジオメトリを解析できず、空ジオメトリにしました。',
  'tool.format-convert.warnGpkgEmptyGeometry':
    '{count} 個の空ジオメトリを NULL として書き込みました。',

  /* ---------- T10 等距離円とバッファ ---------- */
  'tool.buffer-circle.h1': '等距離円とバッファ',
  'tool.buffer-circle.lead':
    '「この地点から N km の範囲はどこまでか」に答えます。地球の曲率を考慮した等距離円、または既存フィーチャのバッファを生成し、地図で確認して GeoJSON・KML・WKT に出力します。',
  'tool.buffer-circle.modeCircle': '等距離円',
  'tool.buffer-circle.modeBuffer': '既存フィーチャのバッファ',
  'tool.buffer-circle.pickOn': '地図から取得中…（地図をクリック）',
  'tool.buffer-circle.pickOff': '中心点を地図から取得',
  'tool.buffer-circle.radii': '半径',
  'tool.buffer-circle.radiiHint': '複数の半径はカンマ・空白・セミコロンで区切ります（例：1, 3, 5）。',
  'tool.buffer-circle.unit': '単位',
  'tool.buffer-circle.unit.m': 'メートル',
  'tool.buffer-circle.unit.km': 'キロメートル',
  'tool.buffer-circle.unit.mi': 'マイル',
  'tool.buffer-circle.unit.nmi': '海里',
  'tool.buffer-circle.segments': '境界の分割数',
  'tool.buffer-circle.segmentsHint': '既定は 128 分割。増やすと滑らかになりますが点数も増えます。',
  'tool.buffer-circle.bufferInput': 'バッファするフィーチャ',
  'tool.buffer-circle.bufferPlaceholder':
    'GeoJSON、KML、GPX、CSV、WKT のフィーチャ、または 1 行に 1 組の「経度, 緯度」を貼り付け…',
  'tool.buffer-circle.bufferHint':
    '点・線・面のいずれにも対応し、各フィーチャを半径ごとに外側へバッファリングします。点は経緯度の行をそのまま貼り付けてもかまいません。',
  'tool.buffer-circle.resultTitle': '結果',
  'tool.buffer-circle.colRadius': '半径',
  'tool.buffer-circle.colArea': '面積',
  'tool.buffer-circle.colPerimeter': '周長',
  'tool.buffer-circle.colPoints': '点数',
  'tool.buffer-circle.exportLabel': '出力形式',
  'tool.buffer-circle.errCenter': '緯度は −90〜90、経度は −180〜180 の範囲で入力してください。',
  'tool.buffer-circle.errRadiusNumber': '数値の半径を 1 つ以上入力してください。',
  'tool.buffer-circle.errRadiusPositive': 'すべての半径は 0 より大きくしてください。',
  'tool.buffer-circle.errRadiusLimit':
    '1 つの半径は 20,000 km を超えられません。それ以上は半球に近づき、等距離円の意味がなくなります。',
  'tool.buffer-circle.errBufferEmpty':
    'バッファするフィーチャを追加するか、等距離円モードに切り替えてください。',
  'tool.buffer-circle.errBufferParse':
    'バッファ入力を解析できません。GeoJSON、KML、GPX、CSV、WKT を貼り付けてください。',
  'tool.buffer-circle.precisionReduced':
    '動作を軽くするため、境界の分割数を {segments} に減らしました。',
  'tool.buffer-circle.sphereFallback':
    '対跖点に近い一部の境界点は球面近似を使用しました。',
  'common.mapDragPrompt': 'タップして地図のドラッグを有効化',
  'common.mapLoading': '地図を読み込み中…',
  'common.mapTileError':
    '地図タイルを読み込めませんでした。計算とエクスポートは引き続き利用できます。',
  'common.mapPreview': '地図プレビュー',
  'common.pickFromMap': '地図から取得',
  'common.pickingMap': '地図をクリックして座標を取得…',
  'common.mapPreviewHint': '地図は視覚的な確認用です。計算は上の値を使用します。',
  'common.basemap': 'ベースマップ',
  'common.basemapStreet': '街路',
  'common.basemapSatellite': '衛星',
  'common.basemapTerrain': '地形',

  /* ---------- T14 Google タイル座標生成 ---------- */
  'tool.tile-coords.h1': 'Google タイル座標生成',
  'tool.tile-coords.startDraw': '範囲を選択',
  'tool.tile-coords.stopDraw': '選択を終了',
  'tool.tile-coords.drawHint':
    '範囲選択と GeoJSON 読み込みはどちらか一方。選択中は地図を移動できません。',
  'tool.tile-coords.bboxTitle': '現在の範囲',
  'tool.tile-coords.clearSelection': '選択を解除',
  'tool.tile-coords.west': '西端',
  'tool.tile-coords.south': '南端',
  'tool.tile-coords.east': '東端',
  'tool.tile-coords.north': '北端',
  'tool.tile-coords.selectEmpty':
    '範囲が未選択です。地図上でドラッグするか、対角の 2 点をクリックしてください。',
  'tool.tile-coords.crossAntimeridian':
    '範囲が 180° 経線をまたいでいます。東西両側のタイルが含まれます。',
  'tool.tile-coords.importTitle': 'データ読み込み',
  'tool.tile-coords.otherFormatHint': '他の形式は先に',
  'tool.tile-coords.formatConvert': '形式変換ツール',
  'tool.tile-coords.importing': '解析中…',
  'tool.tile-coords.imported':
    '「{name}」を読み込みました：フィーチャー {count} 件。元の境界を地図に表示します。',
  'tool.tile-coords.boundaryNote':
    'タイルは元の境界で絞り込み、境界と交差するタイルだけを残します。',
  'tool.tile-coords.zoomTitle': 'ズームレベル',
  'tool.tile-coords.zoomMin': '最小 Z',
  'tool.tile-coords.zoomMax': '最大 Z',
  'tool.tile-coords.zoomRange': '0〜22',
  'tool.tile-coords.generate': 'タイル座標を生成',
  'tool.tile-coords.generateHint':
    '現在の範囲とズームレベルで計算します。変更後は再生成してください。',
  'tool.tile-coords.generating': '生成中',
  'tool.tile-coords.packing': 'CSV を準備中',
  'tool.tile-coords.cancelGenerate': '生成を中止',
  'tool.tile-coords.progress': '{done} / {total} 完了',
  'tool.tile-coords.warnLarge':
    '約 {count} タイルです。生成・プレビュー・ダウンロードが非常に遅くなり、ブラウザが固まったりメモリ不足になる可能性があります。ズームレベルを下げるか範囲を狭めてください。',
  'tool.tile-coords.total': '全 {total} タイル。Z → Y → X の順に並んでいます。',
  'tool.tile-coords.downloadCsv': 'CSV をダウンロード',
  'tool.tile-coords.downloadZip': 'ZIP をダウンロード（ズームごとに CSV）',
  'tool.tile-coords.downloadHint':
    'ズームレベルごとに 1 つの CSV（見出しは x, y, z）を出力します。複数レベルは ZIP にまとめ、巨大な表の解析を避けます。',
  'tool.tile-coords.errZoomRange': 'ズームレベルは 0〜22 の整数で指定してください。',
  'tool.tile-coords.errZoomOrder': '最小ズームレベルは最大ズームレベル以下にしてください。',
  'tool.tile-coords.errEmptyFile': 'ファイルが空か、読み取れる内容がありません。',
  'tool.tile-coords.errGeojsonOnly':
    'GeoJSON のみ対応しています。形式変換ツールで GeoJSON に変換してから読み込んでください。',
  'tool.tile-coords.errParse': 'ファイルを解析できません。有効な GeoJSON か確認してください。',
  'tool.tile-coords.errNoCoords':
    '利用できる座標がありません。フィーチャーに経度・緯度が含まれるか確認してください。',
  'tool.tile-coords.errCoordRange':
    '座標が範囲外です。経度は −180〜180、緯度は −90〜90 で指定してください。',
  'tool.tile-coords.errGeneric':
    'タイル計算に失敗しました。範囲またはズームレベルを調整して再試行してください。',

  /* ---------- T15 マッププレビュー ---------- */
  'tool.map-preview.fileTitle': 'データファイル',
  'tool.map-preview.chooseFile': 'ファイルを選択',
  'tool.map-preview.addFile': 'ファイルを追加',
  'tool.map-preview.formatLabel': 'ファイル形式',
  'tool.map-preview.formatAuto': '自動判別',
  'tool.map-preview.formatHint': '判別できない場合は、左側で形式を選ぶと再解析します。',
  'tool.map-preview.supported':
    'GeoJSON、TopoJSON、KML/KMZ、GPX、CSV/TSV、Excel、Shapefile（ZIP）、FlatGeobuf、GeoPackage、WKT、GML、DXF、MIF/MID、GMT に対応しています。',
  'tool.map-preview.dataTitle': '読み込んだデータ',
  'tool.map-preview.fileCount': '{n} ファイル',
  'tool.map-preview.totalFeatures': '合計 {n} 要素',
  'tool.map-preview.removeFile': 'このファイルを削除',
  'tool.map-preview.empty':
    'まだデータがありません。ファイルを選ぶと地図に重ねて表示し、ここにファイルごとの統計を出します。',
  'tool.map-preview.statFormat': '形式',
  'tool.map-preview.statFeatures': '要素',
  'tool.map-preview.statTypes': 'ジオメトリ種別',
  'tool.map-preview.statIssues': '問題',
  'tool.map-preview.issuesValue': '{n} 件',
  'tool.map-preview.warnings': 'ほかに {n} 件の解析メモ',
  'tool.map-preview.loading': '解析中…',
  'tool.map-preview.clearData': 'データを消去',
  'tool.map-preview.errRead': 'ファイルを読み込めませんでした。もう一度選択してください。',
  'tool.map-preview.errTooLarge': 'ファイルが 20 MB を超えています。切り出してからお試しください。',
  'tool.map-preview.errUnknownFormat':
    'ファイル形式を判別できません。左側で形式を選んで再試行してください。',
  'tool.map-preview.errParse': '解析に失敗しました。ファイルが壊れているか、選択した形式と異なる可能性があります。',
  'tool.map-preview.errNoCoords': '地図に表示できる座標がファイルに含まれていません。',
  'tool.map-preview.errCoordRange':
    '座標が経度・緯度の範囲外です（経度 ±180、緯度 ±90）。WGS84 の経緯度かご確認ください。',
  'tool.map-preview.errEmptyFile': 'ファイルが空です。',
  'tool.map-preview.errTooMany': '要素が 50,000 件を超えています。範囲を絞ってから表示してください。',

  /* ---------- T16 クリップとオーバーレイ ---------- */
  'tool.clip-overlay.layerA': 'レイヤー A（処理対象）',
  'tool.clip-overlay.layerB': 'レイヤー B（重ね合わせ）',
  'tool.clip-overlay.chooseFile': 'ファイルを選択',
  'tool.clip-overlay.changeFile': 'ファイルを変更',
  'tool.clip-overlay.noLayer': 'ファイル未選択',
  'tool.clip-overlay.featuresCount': '{n} 件のフィーチャ',
  'tool.clip-overlay.parsing': '解析中…',
  'tool.clip-overlay.layerBSkip': 'この操作はレイヤー A のみを使用します',
  'tool.clip-overlay.operation': '操作',
  'tool.clip-overlay.op.clip': 'クリップ',
  'tool.clip-overlay.op.intersect': '交差',
  'tool.clip-overlay.op.difference': '差分',
  'tool.clip-overlay.op.simplify': '簡略化',
  'tool.clip-overlay.op.clipHint': 'レイヤー A のうちレイヤー B の内側にある部分を残します。',
  'tool.clip-overlay.op.intersectHint': 'レイヤー A とレイヤー B の共通部分を残します。',
  'tool.clip-overlay.op.differenceHint': 'レイヤー A からレイヤー B と重なる部分を取り除きます。',
  'tool.clip-overlay.op.simplifyHint': 'レイヤー A の頂点を間引きます。許容値が小さいほど詳細が残ります。',
  'tool.clip-overlay.tolerance': '許容値（メートル）',
  'tool.clip-overlay.run': '実行',
  'tool.clip-overlay.running': '計算中…',
  'tool.clip-overlay.resultTitle': '結果',
  'tool.clip-overlay.resultFeatures': '結果のフィーチャ数',
  'tool.clip-overlay.resultArea': '合計面積',
  'tool.clip-overlay.resultSkipped': '対象外',
  'tool.clip-overlay.download': 'GeoJSON をダウンロード',
  'tool.clip-overlay.clear': 'クリア',
  'tool.clip-overlay.privacy': 'すべての計算はブラウザ内で行われ、ファイルは送信されません。',
  'tool.clip-overlay.note':
    'クリップ・交差・差分はポリゴンのみを対象とします。点と線はスキップされ「対象外」に計上されます。',
  'tool.clip-overlay.errTooLarge': 'ファイルが 20 MB を超えています。先に切り出すか簡略化してください。',
  'tool.clip-overlay.errUnknownFormat': '形式を判別できません。GeoJSON に変換してからお試しください。',
  'tool.clip-overlay.errTooMany': 'フィーチャが 50,000 件を超えています。範囲を絞ってください。',
  'tool.clip-overlay.errEmpty': 'ファイルが空か、利用できるフィーチャがありません。',
  'tool.clip-overlay.errParse': '解析に失敗しました。ファイルが壊れているか形式が異なります。',
  'tool.clip-overlay.errNoResult':
    '結果が空です。レイヤーが重なっていないか、点・線のみの可能性があります。',
  'tool.clip-overlay.errGeneric': '演算に失敗しました。レイヤーが有効かご確認ください。',
  'tool.clip-overlay.errNeedA': '先にレイヤー A を選択してください。',
  'tool.clip-overlay.errNeedBoth': 'クリップ・交差・差分にはレイヤー A と B の両方が必要です。',

  /* ---------- T17 属性で抽出 ---------- */
  'tool.attribute-extract.fileTitle': 'データファイル',
  'tool.attribute-extract.chooseFile': 'ファイルを選択',
  'tool.attribute-extract.changeFile': 'ファイルを変更',
  'tool.attribute-extract.parsing': '解析中…',
  'tool.attribute-extract.noLayer': 'ファイル未選択',
  'tool.attribute-extract.featuresCount': '{n} 件のフィーチャ',
  'tool.attribute-extract.layerLabel': 'レイヤー',
  'tool.attribute-extract.layerAll': 'すべてのフィーチャ',
  'tool.attribute-extract.layer.point': 'ポイントレイヤー',
  'tool.attribute-extract.layer.line': 'ラインレイヤー',
  'tool.attribute-extract.layer.polygon': 'ポリゴンレイヤー',
  'tool.attribute-extract.layer.other': 'その他',
  'tool.attribute-extract.conditionTitle': '抽出条件',
  'tool.attribute-extract.fieldLabel': 'フィールド',
  'tool.attribute-extract.fieldPlaceholder': '利用できる属性フィールドがありません',
  'tool.attribute-extract.sampleHint': '{field} の例：{values}',
  'tool.attribute-extract.operatorLabel': '条件',
  'tool.attribute-extract.op.eq': '等しい',
  'tool.attribute-extract.op.neq': '等しくない',
  'tool.attribute-extract.op.contains': '含む',
  'tool.attribute-extract.op.gt': 'より大きい',
  'tool.attribute-extract.op.gte': '以上',
  'tool.attribute-extract.op.lt': 'より小さい',
  'tool.attribute-extract.op.lte': '以下',
  'tool.attribute-extract.op.empty': '空である',
  'tool.attribute-extract.op.notEmpty': '空でない',
  'tool.attribute-extract.valueLabel': '値',
  'tool.attribute-extract.valuePlaceholder': '一致させる値',
  'tool.attribute-extract.valueHint': '既存の値 {n} 件。一覧から選ぶか直接入力してください。',
  'tool.attribute-extract.numericHint':
    'このフィールドは数値ではないため、大小比較の条件は一致しません。',
  'tool.attribute-extract.run': '抽出',
  'tool.attribute-extract.running': '抽出中…',
  'tool.attribute-extract.resultTitle': '結果',
  'tool.attribute-extract.resultCount': '{total} 件中 {matched} 件が一致',
  'tool.attribute-extract.download': 'GeoJSON をダウンロード',
  'tool.attribute-extract.clear': 'クリア',
  'tool.attribute-extract.privacy': 'すべての計算はブラウザ内で行われ、ファイルは送信されません。',
  'tool.attribute-extract.errNeedFile': '先にデータファイルを選択してください。',
  'tool.attribute-extract.errNeedField': '絞り込むフィールドを選択してください。',
  'tool.attribute-extract.errNeedValue': '一致させる値を入力してください。',
  'tool.attribute-extract.errTooLarge': 'ファイルが 20 MB を超えています。先に切り出すか簡略化してください。',
  'tool.attribute-extract.errUnknownFormat': '形式を判別できません。GeoJSON に変換してからお試しください。',
  'tool.attribute-extract.errTooMany': 'フィーチャが 50,000 件を超えています。範囲を絞ってください。',
  'tool.attribute-extract.errEmpty': 'ファイルが空か、利用できるフィーチャがありません。',
  'tool.attribute-extract.errParse': '解析に失敗しました。ファイルが壊れているか形式が異なります。',
  'tool.attribute-extract.errNoMatch': '条件に一致するフィーチャがありません。条件や値を調整してください。',
  'tool.attribute-extract.errGeneric': '抽出に失敗しました。データが有効かご確認ください。',

  /* ---------- 解説記事（P1 /guide/） ---------- */
  'guide.title': '解説記事：座標系・投影・ベクター形式 | ジオツールボックス',
  'guide.description':
    '地図投影、EPSG コード、ベクター形式を平易に解説し、対応するブラウザツールへリンクします。',
  'guide.h1': '解説記事',
  'guide.group.projection': '座標系と投影',
  'guide.group.vector': 'ベクター形式',
  'guide.group.tile': '地図タイル',
  'guide.group.projection.desc': '投影の役割、EPSG コードの読み方、用途別の選び方。',
  'guide.group.vector.desc': 'これらのツールが読み書きする 15 のベクター形式と使い分け。',
  'guide.group.tile.desc': 'XYZ タイル番号、ズームレベル、範囲からタイル座標への変換。',
  'guide.meta': '全 {articles} 本 · {groups} 分類',
  'guide.count': '{n} 本',
  'guide.jump': '分類へ移動',
  'guide.lead':
    'ツールの背景にある概念を読む：投影の役割、EPSG コードの読み方、選ぶべきベクター形式。',
  'guide.readMore': '記事を読む',
  'guide.minutes': '約 {count} 分',
  'guide.updated': '{date} 更新',

  /* ---------- T09 オンライン地図描画 ---------- */
  'tool.map-draw.h1': 'オンライン地図描画ツール',
  'tool.map-draw.lead':
    '地図上で点・線・ポリゴン・矩形・円を描き、距離と面積を確認し、属性を編集して GeoJSON・KML・GPX・WKT・CSV に出力します。処理はすべてブラウザ内で完結します。',
  'tool.map-draw.modeSelect': '選択',
  'tool.map-draw.modePoint': '点',
  'tool.map-draw.modeLine': '線',
  'tool.map-draw.modePolygon': 'ポリゴン',
  'tool.map-draw.modeRect': '矩形',
  'tool.map-draw.modeCircle': '円',
  'tool.map-draw.dragModeTitle': 'ドラッグモード',
  'tool.map-draw.dragModeMap': '地図をドラッグ',
  'tool.map-draw.dragModeVertex': '頂点をドラッグ',
  'tool.map-draw.vertexModeHint':
    '現在は地図ドラッグモードです。頂点を調整するには「頂点をドラッグ」に切り替えてください。',
  'tool.map-draw.hint.select': 'フィーチャをクリックすると選択・編集できます。地図をドラッグすると移動します。',
  'tool.map-draw.hint.point': '地図をクリックして点を追加します。連続クリックで複数の点を追加できます。',
  'tool.map-draw.hint.line': 'クリックで頂点を追加。ダブルクリックまたは Enter で終了、Esc で取消。',
  'tool.map-draw.hint.polygon': 'クリックで頂点を追加。ダブルクリックまたは Enter で閉じます。Esc で取消。',
  'tool.map-draw.hint.rect': '一方の角から対角へドラッグします。',
  'tool.map-draw.hint.circle': '中心で押し、ドラッグして半径を決めます。',
  'tool.map-draw.undo': '元に戻す',
  'tool.map-draw.redo': 'やり直す',
  'tool.map-draw.clearAll': 'すべて消去',
  'tool.map-draw.clearConfirm': '{count} 件すべてを削除しますか？元に戻せます。',
  'tool.map-draw.confirmYes': '実行',
  'tool.map-draw.confirmNo': 'キャンセル',
  'tool.map-draw.featuresTitle': 'フィーチャ一覧',
  'tool.map-draw.featuresEmpty': 'まだ何も描かれていません。上の描画モードを選び、地図をクリックしてください。',
  'tool.map-draw.unnamed': '名称未設定の{type}',
  'tool.map-draw.typePoint': '点',
  'tool.map-draw.typeLine': '線',
  'tool.map-draw.typePolygon': 'ポリゴン',
  'tool.map-draw.typeOther': 'ジオメトリ',
  'tool.map-draw.statCount': '{count} フィーチャ',
  'tool.map-draw.statLength': '合計長',
  'tool.map-draw.statArea': '合計面積',
  'tool.map-draw.statTypes': '種類',
  'tool.map-draw.delete': '削除',
  'tool.map-draw.propsTitle': '属性',
  'tool.map-draw.nameLabel': '名前',
  'tool.map-draw.descLabel': '説明',
  'tool.map-draw.customTitle': 'カスタム属性',
  'tool.map-draw.addProperty': '属性を追加',
  'tool.map-draw.removeProperty': '削除',
  'tool.map-draw.keyPlaceholder': 'キー',
  'tool.map-draw.valuePlaceholder': '値',
  'tool.map-draw.propsEmptyKey': '属性名を空にはできません。',
  'tool.map-draw.propsDuplicate': '属性名は重複できません。',
  'tool.map-draw.propsReserved': 'type・coordinates・geometry・properties などは予約済みの属性名です。',
  'tool.map-draw.importTitle': '既存データを追加',
  'tool.map-draw.importHint': '読み込んだフィーチャは現在の地図に追加され、既存の内容は消えません。',
  'tool.map-draw.importPlaceholder': 'GeoJSON、KML、GPX、CSV、WKT を貼り付け…',
  'tool.map-draw.importButton': '貼り付け内容を追加',
  'tool.map-draw.importFile': 'ファイルを選択',
  'tool.map-draw.imported': '{count} フィーチャを追加しました。',
  'tool.map-draw.importEmpty': '入力にフィーチャが見つかりませんでした。',
  'tool.map-draw.importFailed': '入力を解析できません。形式を確認してください。',
  'tool.map-draw.exportTitle': 'エクスポート',
  'tool.map-draw.exportFormat': '形式',
  'tool.map-draw.exportEmpty': 'エクスポートするには 1 つ以上描画または読み込んでください。',
  'tool.map-draw.exportFailed': '出力を生成できません。別の形式を試してください。',
  'tool.map-draw.gpxSkipped': 'GPX はポリゴンを保存できないため、{count} 件のポリゴンをスキップしました。',
  'tool.map-draw.shapefileBinaryNote':
    'Shapefile 出力はバイナリ ZIP（.shp/.shx/.dbf/.prj/.cpg）のため、ページ内でプレビューできません。ダウンロード後に QGIS や ArcGIS で開いてください。',
  'tool.map-draw.draftPrefix': '描画中：',
  'tool.map-draw.vertexHint': 'このフィーチャは {count} 頂点です。精密な編集はデスクトップ推奨です。',
  'tool.map-draw.featuresWarn':
    '2,000 件を超えると動作が重くなる可能性があります。分割して出力・整理してください。',
  'tool.map-draw.finishDraftFirst':
    '描画モードを切り替える前に、現在の図形を完了するか取り消してください。',
  'tool.map-draw.needTwoPoints': '線には 2 点以上必要です。',
  'tool.map-draw.needThreePoints': 'ポリゴンには 3 点以上必要です。',
  'tool.map-draw.storageTitle': 'ローカル自動保存',
  'tool.map-draw.restored':
    'このブラウザから {count} フィーチャを復元しました。不要な場合は「ローカル保存を削除」を押してください。',
  'tool.map-draw.clearStorage': 'ローカル保存を削除',
  'tool.map-draw.storageCleared': 'ローカル保存を削除しました。',
  'tool.map-draw.storageFull':
    'ブラウザの保存領域が不足しています。自動保存を停止しました。すぐにエクスポートしてください。',

  /* ---------- FR-13 一括処理 ---------- */
  'batch.title': '一括処理',
  'batch.lead':
    'CSV/TSV を読み込み、列を対応付け、数行を試算してから計算列を追加しダウンロードします。ファイルはブラウザ内だけで処理されます。',
  'batch.desktopOnly': 'デスクトップ',
  'batch.chooseFile': 'CSV/TSV/Excel を選択',
  'batch.replaceFile': '別のファイルを選択',
  'batch.pasteLabel': 'または CSV/TSV を貼り付け',
  'batch.pastePlaceholder': 'name,lng,lat\nA,116.3974,39.9088',
  'batch.limitHint': '最大 20 MB または 50,000 行。既定は UTF-8。Excel は先頭シートを読み込みます。',
  'batch.xlsxHint': 'Excel モード：先頭シートのみ読み込み、文字コードと区切り文字は無視します。',
  'batch.xlsxSheet': 'シート：{name}',
  'batch.encoding': '文字コード',
  'batch.encUtf8': 'UTF-8',
  'batch.encGbk': 'GBK / GB18030',
  'batch.delimiter': '区切り文字',
  'batch.delimAuto': '自動判別',
  'batch.delimComma': 'カンマ',
  'batch.delimTab': 'タブ',
  'batch.delimSemicolon': 'セミコロン',
  'batch.hasHeader': '先頭行はヘッダー',
  'batch.bom': 'UTF-8 BOM を付与（Excel）',
  'batch.parseWarnings': '{count} 件の解析警告があります。試算結果を確認してください。',
  'batch.mappingTitle': '列の対応付け',
  'batch.mappingHint': '* は必須列です。自動判別は候補です。確認してから実行してください。',
  'batch.notMapped': '未対応',
  'batch.missingColumns': '先に必須列を対応付けてください：',
  'batch.optionsTitle': 'オプション',
  'batch.formatTitle': '書式設定',
  'batch.previewTitle': '試算（先頭 8 行）',
  'batch.previewLoading': '試算中…',
  'batch.previewEmpty': '必須列を対応付けると試算が表示されます。',
  'batch.previewFailures': '試算で {count} 行が失敗しました。',
  'batch.run': '一括実行',
  'batch.running': '実行中…',
  'batch.cancel': 'キャンセル',
  'batch.rowCount': '{count} 行のデータ',
  'batch.cancelled': 'キャンセルしました。完了済みの行は下に残ります。',
  'batch.resultTitle': '一括処理の結果',
  'batch.successCount': '成功 {count} 行',
  'batch.failureCount': '失敗 {count} 行',
  'batch.download': '結果 CSV をダウンロード',
  'batch.downloadFailed': '失敗行をダウンロード',
  'batch.failuresTitle': '失敗行（{count}）',
  'batch.colRow': '行番号',
  'batch.colReason': '理由',
  'batch.failuresMore': '残り {count} 件の失敗はダウンロードファイルに含まれます。',
  'batch.emptyBody': 'CSV/TSV を貼り付けるか選択して開始します。アップロードは行われません。',
  'batch.err.empty-table': 'データ行が見つかりません。',
  'batch.err.too-large': '入力が大きすぎます。20 MB 以下のファイルを使用してください。',
  'batch.err.too-many-rows': 'データ行が 50,000 行を超えています。',
  'batch.err.file-too-large': 'ファイルが 20 MB の上限を超えています。',
  'batch.err.parse-failed': '表を解析できませんでした。',
  'batch.err.xlsx-load-failed': 'Excel 解析ライブラリを読み込めません。通信状態を確認して再試行してください。',
  'batch.err.xlsx-parse-failed': 'この .xlsx ファイルを読み込めません。',
  'batch.err.xlsx-empty': '先頭のシートが空です。',
  'batch.err.missing-columns': '必須列が対応付けられていません。',
  'batch.err.prepare-failed': '計算を初期化できません。オプションを確認してください。',
  'batch.err.run-failed': '一括処理を完了できませんでした。',
  'batch.err.missing-value': '必須値が空です',
  'batch.err.invalid-number': '有効な数値ではありません',
  'batch.err.not-finite': '結果が有限値ではありません',
  'batch.err.convert-failed': '変換に失敗しました',
  'batch.err.invalid-lng': '経度が不正です',
  'batch.err.invalid-lat': '緯度が不正です',
  'batch.err.invalid-unit': '不明な単位コードです',
  'batch.err.invalid-date': '日付が不正です（YYYY-MM-DD）',
  'batch.err.no-coordinate': '座標を認識できません',
  'batch.err.failed': '行の処理に失敗しました',
  'batch.col.lng': '経度',
  'batch.col.lat': '緯度',
  'batch.col.lngText': '経度（テキスト）',
  'batch.col.latText': '緯度（テキスト）',
  'batch.col.x': 'X（経度 / 東座標）',
  'batch.col.y': 'Y（緯度 / 北座標）',
  'batch.col.startLng': '始点の経度',
  'batch.col.startLat': '始点の緯度',
  'batch.col.endLng': '終点の経度',
  'batch.col.endLat': '終点の緯度',
  'batch.col.date': '日付（任意）',
  'batch.out.decimalLng': '十進経度',
  'batch.out.decimalLat': '十進緯度',
  'batch.out.dmsLng': '度分秒の経度',
  'batch.out.dmsLat': '度分秒の緯度',
  'batch.out.outX': 'X（経度 / 東座標）',
  'batch.out.outY': 'Y（緯度 / 北座標）',
  'batch.out.distanceM': '距離（m）',
  'batch.out.distanceKm': '距離（km）',
  'batch.out.bearingDeg': '初期方位角（°）',
  'batch.out.geohash': 'GeoHash',
  'batch.out.sunrise': '日の出',
  'batch.out.sunset': '日の入り',
  'batch.out.solarNoon': '太陽正午',
  'batch.out.dayLengthMin': '昼の長さ（分）',
  'batch.out.polar': '極昼・極夜',
  'batch.out.lng': '経度',
  'batch.out.lat': '緯度',
  'batch.opt.fromEpsg': '元 EPSG',
  'batch.opt.toEpsg': '先 EPSG',
  'batch.opt.precision': 'GeoHash 精度（1〜12）',
  'batch.opt.tzMinutes': 'タイムゾーン偏移（分）',
  'batch.col.coord': '座標（経度, 緯度）',
  'batch.opt.sourceFormat': '元の形式',
  'batch.opt.targetFormat': '出力形式',
  'batch.opt.coordPrecision': '小数点以下の桁数（0〜12）',
  'batch.format.auto': '自動判定',
  'batch.format.decimal': '10進度',
  'batch.format.dm': '度分',
  'batch.format.dms': '度分秒',
  'batch.err.invalid-coord': '座標を解析できません。元の形式と座標の書き方を確認してください。',

  /* ---------- Cookie 同意（FR-10） ---------- */
  'cookie.aria': 'Cookie の同意',
  'cookie.text':
    '選択内容とツールの設定を記憶するため、必要なブラウザストレージを使用します。同意いただいた場合のみ Google AdSense を読み込み、広告 Cookie が設定されることがあります。',
  'cookie.acceptAll': 'すべて同意',
  'cookie.necessary': '必要なもののみ',
  'cookie.privacy': 'プライバシーポリシー',
  'cookie.settings': 'Cookie 設定',

  /* ---------- 言語未提供の案内（FR-08） ---------- */
  'lang.notAvailable': 'このツールの{lang}版はまだありません。{shown}版を表示しています。'
}

export default ja
