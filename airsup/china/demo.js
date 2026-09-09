function nameFromDomain(domain) {
  const host = String(domain || '').replace(/^www\./, '');
  const stem = host.split('.')[0] || host;
  return stem
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || host;
}

function guessNiche(text) {
  const hay = String(text || '').toLowerCase();
  if (/pcba|smt|pcb|电路|贴片/.test(hay)) return 'pcba';
  if (/injection|mold|mould|注塑|模具|pa66|abs|housing/.test(hay)) return 'injection';
  if (/cnc|machin|铣|车削|五轴|精密/.test(hay)) return 'cnc';
  return 'cnc';
}

function genericDemo(lang) {
  const zh = lang !== 'en';
  return {
    niche: 'injection',
    companyName: zh ? '示例东莞厂家' : 'Dongguan factory',
    companyDomain: 'example-factory.com',
    city: zh ? '东莞' : 'Dongguan',
    chatgptBuyer: zh
      ? '帮我找一家东莞的注塑厂，做这个壳体。首单 5000 件，材料 PA66 GF30。'
      : 'find me a good injection molding supplier in Dongguan for this housing. 5,000 pcs first order, PA66 GF30.',
    statusLines: zh
      ? ['ChatGPT 正在使用 Airsup', '正在检索已验证厂家…', '找到 6 家相关工厂。', '正在与最匹配的厂家沟通…']
      : ['ChatGPT uses Airsup', 'Searching verified suppliers...', 'Found 6 relevant factories.', 'Talking to the best matches...'],
    agents: zh
      ? [
          { from: 'buyer', text: '能否生产约 82g 的 PA66 GF30 零件？' },
          { from: 'factory', text: '可以。我们做 PA66 GF30。是否也需要开模？' },
          { from: 'buyer', text: '需要新模。外观件，黑色。' },
          { from: 'factory', text: '可以做开模加量产。请发 STEP，我们再看结构和报价。' },
        ]
      : [
          { from: 'buyer', text: 'Can you manufacture PA66 GF30 parts around 82g?' },
          { from: 'factory', text: 'Yes. We run PA66 GF30. Do you need tooling as well?' },
          { from: 'buyer', text: 'Yes. New mold. Cosmetic housing, black.' },
          { from: 'factory', text: 'We can support tooling + production. Please send STEP files so we can check DFM and quote.' },
        ],
    resultLead: zh
      ? '我找到 2 家已验证、看起来匹配的厂家。'
      : 'I found 2 verified suppliers that fit.',
    suppliers: zh
      ? [
          {
            name: '供应商 A · 东莞',
            lines: ['开模 + PA66 GF30 注塑', '可接首单 5000 件', '需要 STEP 才能做结构和报价'],
          },
          {
            name: '供应商 B · 东莞',
            lines: ['PA66 / PA66 GF30', '现有模具或新模均可谈', '需要图纸确认外观要求'],
          },
        ]
      : [
          {
            name: 'Supplier A · Dongguan',
            lines: ['tooling + PA66 GF30 injection molding', '5,000 pcs initial volume accepted', 'needs STEP files for DFM + quote'],
          },
          {
            name: 'Supplier B · Dongguan',
            lines: ['PA66 family', 'new mold or existing tool', 'needs drawings for cosmetic finish'],
          },
        ],
  };
}

function personalizedDemo(lang, preview) {
  const zh = lang !== 'en';
  const base = genericDemo(lang);
  const name = preview.companyName || nameFromDomain(preview.domain);
  const city = preview.city || (zh ? '中国' : 'China');
  const domain = preview.domain;
  const niche = preview.niche || guessNiche(`${name} ${preview.summary || ''}`);
  const caps = (preview.capabilities || []).slice(0, 4);

  const scripts = {
    injection: genericDemo(lang),
    pcba: {
      chatgptBuyer: zh
        ? `帮我找能做这款控制板 SMT/PCBA 的厂家，小批量先 300 套，有 ISO。`
        : 'find me a PCBA/SMT supplier for this controller board. First 300 sets, ISO preferred.',
      agents: zh
        ? [
            { from: 'buyer', text: '能否做这款 4 层板的 SMT，小批量 300 套？' },
            { from: 'factory', text: `可以按我们已公开的工艺来谈。请发 BOM 和 Gerber。` },
            { from: 'buyer', text: '有。还要功能测试。' },
            { from: 'factory', text: '把测试要求一并发来。确认后可以把询盘交给销售。' },
          ]
        : [
            { from: 'buyer', text: 'Can you SMT this 4-layer board in a 300-set first lot?' },
            { from: 'factory', text: 'We can discuss against our published process. Please send BOM and Gerber.' },
            { from: 'buyer', text: 'Yes. Functional test as well.' },
            { from: 'factory', text: 'Send the test requirements. Then this can go to sales as a qualified RFQ.' },
          ],
      resultLead: zh ? '我找到一家已验证厂家，看起来可以谈。' : 'I found a verified supplier that appears to fit.',
    },
    cnc: {
      chatgptBuyer: zh
        ? `帮我找深圳或东莞的 CNC 厂，50 件铝合金壳体，有外观要求。`
        : 'find me a CNC supplier in Shenzhen or Dongguan for 50 aluminum housings with a cosmetic finish.',
      agents: zh
        ? [
            { from: 'buyer', text: '能否做约 50 件铝合金件，有外观面？' },
            { from: 'factory', text: '可以按我们已填写的工艺来看。请发数量、公差和 STEP。' },
            { from: 'buyer', text: '50 件。还要阳极氧化。' },
            { from: 'factory', text: '请把 STEP 发来。缺图纸我们无法报交期或单价。' },
          ]
        : [
            { from: 'buyer', text: 'Can you machine about 50 aluminum parts with a cosmetic face?' },
            { from: 'factory', text: 'We can review against our published process. Please send quantity, tolerance and STEP.' },
            { from: 'buyer', text: '50 pcs. Anodizing too.' },
            { from: 'factory', text: 'Send the STEP. Without drawings we cannot quote lead time or price.' },
          ],
      resultLead: zh ? '我找到一家已验证厂家，看起来可以谈。' : 'I found a verified supplier that appears to fit.',
    },
  };

  const picked = niche === 'pcba' ? scripts.pcba : niche === 'injection' ? scripts.injection : scripts.cnc;
  const agentFactory = (picked.agents || base.agents).map((row) => {
    if (row.from !== 'factory') return row;
    return { ...row, text: row.text };
  });

  const capLines = caps.length
    ? caps
    : zh
      ? ['按网站公开信息理解的能力（预览，需厂家确认）', '验证域名后才能被真实买家问到']
      : ['capabilities inferred from the public website (preview, factory must confirm)', 'buyers cannot actually reach you until the domain is verified'];

  return {
    ...base,
    ...picked,
    niche,
    companyName: name,
    companyDomain: domain,
    city,
    agents: agentFactory,
    resultLead: picked.resultLead || base.resultLead,
    suppliers: [
      {
        name: zh ? `${name} · ${city}` : `${name} · ${city}`,
        lines: [
          domain,
          ...capLines,
          zh ? '需要 STEP / 图纸才能确认交期和报价' : 'needs STEP / drawings to confirm lead time and quote',
        ],
      },
    ],
  };
}

module.exports = {
  nameFromDomain,
  guessNiche,
  genericDemo,
  personalizedDemo,
};
