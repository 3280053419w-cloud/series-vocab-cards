/* Shared validation for browser imports and the online generator. */
(function (root) {
  'use strict';
  const FORMAT = 'series-vocab-deck/v1';
  const clean = (value, label, max = 2000) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(label + '缺失或过长');
    return value.trim();
  };
  const normalize = text => String(text).normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  const titleKey = text => normalize(text).replace(/[^\p{L}\p{N}]/gu, '');
  function input(value) {
    if (!value || typeof value !== 'object') throw new Error('请填写片名和集数');
    const kind = value.kind === 'movie' ? 'movie' : 'series';
    const show = clean(value.show, '剧名／电影名', 120);
    const year = value.year === '' || value.year == null ? null : Number(value.year);
    if (year !== null && (!Number.isInteger(year) || year < 1888 || year > 2100)) throw new Error('请输入有效年份');
    let season = 0, episode = 0;
    if (kind === 'series') {
      season = Number(value.season); episode = Number(value.episode);
      if (![season, episode].every(n => Number.isInteger(n) && n >= 1 && n <= 999)) throw new Error('季数和集数应为 1—999 的整数');
    }
    return { show, kind, year, season, episode };
  }
  function identity(d) { return [titleKey(d.show), d.kind || 'series', d.year || '', d.season, d.episode].join(':'); }
  function idFor(d) {
    let hash = 2166136261;
    for (const ch of identity(d)) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619) >>> 0;
    return 'custom-' + hash.toString(16).padStart(8, '0');
  }
  function validate(payload) {
    if (!payload || payload.format !== FORMAT || !payload.deck) throw new Error('请选择本页导出的剧集词汇 JSON 文件');
    const raw = payload.deck, meta = input(raw);
    if (!Array.isArray(raw.cards) || raw.cards.length !== 50) throw new Error('每集必须恰好有 50 条有效台词');
    const deck = { ...meta, showCn: clean(raw.showCn, '中文片名', 120), epTitle: String(raw.epTitle || '').slice(0, 200), epTitleCn: String(raw.epTitleCn || '').slice(0, 200), date: String(raw.date || '').slice(0, 10), source: clean(raw.source, '来源', 200), sourceUrl: String(raw.sourceUrl || '').slice(0, 2000) };
    if (deck.sourceUrl && !/^https:\/\/[^\s]+$/i.test(deck.sourceUrl)) throw new Error('来源链接必须使用 HTTPS');
    const seen = new Set();
    deck.cards = raw.cards.map((rawCard, index) => {
      if (!rawCard || typeof rawCard !== 'object') throw new Error('第 ' + (index + 1) + ' 条不是有效卡片');
      const c = {};
      for (const key of ['front','word','cn','ipa','trans','meaning','pattern','example','exampleCn','grammar','note','focus']) c[key] = clean(rawCard[key], '第 ' + (index + 1) + ' 条 ' + key, key === 'front' ? 1500 : 2000);
      const sentence = normalize(c.front);
      if (seen.has(sentence)) throw new Error('台词重复，请重新生成');
      seen.add(sentence);
      if (!c.front.toLowerCase().includes(c.focus.toLowerCase())) throw new Error('第 ' + (index + 1) + ' 条填空目标不在原句中');
      if (!Array.isArray(rawCard.words) || rawCard.words.length > 12) throw new Error('句中单词格式不正确');
      c.words = rawCard.words.map(w => {
        const word = clean(w?.word, '句中单词', 100), meaning = clean(w?.meaning, '单词释义', 500);
        if (!sentence.includes(normalize(word))) throw new Error('单词不在对应台词中');
        return {word, meaning};
      });
      c.id = idFor(deck) + '-' + String(index + 1).padStart(2, '0');
      return c;
    });
    return { format: FORMAT, deck };
  }
  function csv(payload) {
    const {deck} = validate(payload), quote = s => '"' + s.replace(/"/g, '""') + '"';
    return ['#separator:Comma','#html:false','#notetype:Basic','#deck:追剧英语::' + deck.show.replace(/[\r\n]/g, ' '),'#columns:Front,Back', ...deck.cards.map(c => quote(c.front) + ',' + quote(c.trans + '（' + c.word + '：' + c.cn + ' ' + c.ipa + '）'))].join('\n');
  }
  const api = { FORMAT, normalize, titleKey, input, identity, idFor, validate, csv };
  root.DeckFormat = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
