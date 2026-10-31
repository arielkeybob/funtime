// Gera os ladrilhos de fundo de Eventos e Amigos (spec 0033) em patterns/*.svg.
// Mesmo gerador da galeria em que o usuário escolheu o estilo: grade 4 × 4 em tijolinho, lugar e giro
// sorteados por semente fixa (sempre o mesmo resultado) e quem passa da borda é repetido do outro
// lado, para o ladrilho emendar sem costura. Uso: node scripts/fundos-build.cjs
const fs = require('fs');
const path = require('path');

// Desenhos numa grade de 24 × 24, só traço, como os ícones do app.
const ICONS = {
  eventos: [
    ['calendario', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2M8 17.5h2"/>'],
    ['oculos', '<path d="M2 9h20M3.5 9c0 3.6 1.4 5.5 4 5.5s4-1.9 4-5.5M12.5 9c0 3.6 1.4 5.5 4 5.5s4-1.9 4-5.5M5.6 10.6l1.6 1.6"/>'],
    ['dj', '<rect x="2" y="7" width="20" height="11" rx="2"/><circle cx="7" cy="12.5" r="3"/><circle cx="17" cy="12.5" r="3"/><path d="M12 9.5v6M11 11.5h2"/>'],
    ['serpentina', '<path d="M10 11a1 1 0 0 1 2 0 2 2 0 0 1-4 0 3 3 0 0 1 6 0 4 4 0 0 1-8 0 5 5 0 0 1 10 0c.5 3.5 2.5 5 4.5 9M4 19.5h.1M7.5 21h.1M20 4h.1"/>'],
    ['globo', '<circle cx="12" cy="13" r="8"/><path d="M12 2v3M4.25 11h15.5M4.25 15h15.5M12 5c-2.8 2.4-2.8 13.6 0 16M12 5c2.8 2.4 2.8 13.6 0 16"/>'],
    ['brilho', '<path d="M10 3c.6 4.2 1.8 5.4 6 6-4.2.6-5.4 1.8-6 6-.6-4.2-1.8-5.4-6-6 4.2-.6 5.4-1.8 6-6zM18.5 14v5M16 16.5h5"/>'],
    ['chapeu', '<circle cx="12" cy="3.2" r="1.4"/><path d="M12 4.6 5.5 20h13zM9.3 11l6.1 1.6M7.8 14.5l9.2 2"/>'],
    ['balao', '<path d="M12 2.5c-3.6 0-6.2 2.8-6.2 6.4 0 3.9 2.9 7.1 6.2 7.1s6.2-3.2 6.2-7.1c0-3.6-2.6-6.4-6.2-6.4zM11 18h2l-1-2zM12 18c0 1.4-1.3 2-.8 3.5"/>'],
    ['ingresso', '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM15 7.8v1.6M15 11.2v1.6M15 14.6v1.6"/>'],
    ['nota', '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'],
    ['fone', '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="7" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="7" rx="1.5"/>'],
    ['caixa', '<rect x="6" y="2.5" width="12" height="19" rx="2"/><circle cx="12" cy="14.5" r="3.5"/><circle cx="12" cy="7" r="1.5"/>'],
    ['microfone', '<circle cx="15" cy="9" r="4"/><path d="M11.7 11.3 3.8 19.6l.6.6 8.3-7.9M12.2 6.2l5.6 5.6"/>'],
    ['fogos', '<circle cx="12" cy="12" r="1.2"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M5.3 18.7l2.8-2.8M15.9 8.1l2.8-2.8"/>'],
    ['lua', '<path d="M19.5 14.6A8 8 0 1 1 9.4 4.5a7.2 7.2 0 0 0 10.1 10.1zM17 3v3.5M15.25 4.75h3.5"/>'],
    ['varal', '<path d="M2 4c6 4 14 4 20 0M6.8 6.3v1.4M12 7v1.4M17.2 6.3v1.4M6.8 7.7c-1.3 1-1.3 3.3 0 3.3s1.3-2.3 0-3.3zM12 8.4c-1.3 1-1.3 3.3 0 3.3s1.3-2.3 0-3.3zM17.2 7.7c-1.3 1-1.3 3.3 0 3.3s1.3-2.3 0-3.3z"/>']
  ],
  amigos: [
    ['dupla', '<circle cx="8.5" cy="7" r="3"/><circle cx="16.5" cy="8.5" r="2.5"/><path d="M3 20c0-3.6 2.4-6.2 5.5-6.2S14 16.4 14 20M15 14c.5-.2 1-.3 1.5-.3 2.6 0 4.5 2.2 4.5 5.3"/>'],
    ['coracao', '<path d="M12 20C6 15.5 3 12.5 3 8.8 3 6.1 5 4 7.6 4c1.8 0 3.3 1 4.4 2.6C13.1 5 14.6 4 16.4 4 19 4 21 6.1 21 8.8c0 3.7-3 6.7-9 11.2z"/>'],
    ['beijo', '<path d="M2.5 11.5C4.5 9 7 7 9 7c1.2 0 2.2.7 3 1.5.8-.8 1.8-1.5 3-1.5 2 0 4.5 2 6.5 4.5-2.5 3.5-5.8 5.5-9.5 5.5s-7-2-9.5-5.5zM2.5 11.5c3 .8 6.5 1.2 9.5 1.2s6.5-.4 9.5-1.2"/>'],
    ['soquinho', '<path d="M1.5 9.5H8a2.5 2.5 0 0 1 2.5 2.5v2A2.5 2.5 0 0 1 8 16.5H1.5M6.5 9.5c0-1.5.8-2.3 2-2.3M7 12.2h3.5M7 14.5h3.5M22.5 9.5H16a2.5 2.5 0 0 0-2.5 2.5v2a2.5 2.5 0 0 0 2.5 2.5h6.5M17.5 9.5c0-1.5-.8-2.3-2-2.3M17 12.2h-3.5M17 14.5h-3.5M12 3v2.5M9 4l1 1.8M15 4l-1 1.8M12 18.5V21"/>'],
    ['conversa', '<path d="M4.5 4.5h15a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2H11l-4.5 3.5V17h-2a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2zM8 10.8h.1M12 10.8h.1M16 10.8h.1"/>'],
    ['tocaaqui', '<path d="M8.5 21v-3.2L5 13.4a1.4 1.4 0 0 1 2.1-1.9L9 13.5V5a1.3 1.3 0 0 1 2.6 0v6.5V3.8a1.3 1.3 0 0 1 2.6 0v7.7V5a1.3 1.3 0 0 1 2.6 0v6.5V7.4a1.3 1.3 0 0 1 2.6 0v7.1c0 3.6-2.4 6.5-5.8 6.5M3.5 5.5l1.6 1.4M2.5 9h2.1M6 2.5l.6 2"/>'],
    ['quebracabeca', '<path d="M3 6h7v3a2 2 0 1 1 0 4v5H3zM11.5 6H21v12h-9.5v-5a2 2 0 1 0 0-4z"/>'],
    ['cartinha', '<rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="m3.5 6.5 8.5 6 8.5-6M12 17.4c-1.5-.9-2.3-1.6-2.3-2.5a1.15 1.15 0 0 1 2.3-.4 1.15 1.15 0 0 1 2.3.4c0 .9-.8 1.6-2.3 2.5z"/>'],
    ['selfie', '<rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M10.5 5h3M8.6 17.5c.6-2 1.9-3.1 3.4-3.1s2.8 1.1 3.4 3.1"/><circle cx="12" cy="11" r="2.2"/>'],
    ['sorriso', '<circle cx="12" cy="12" r="9"/><path d="M8 14.5c1 1.4 2.4 2.1 4 2.1s3-.7 4-2.1M8 10c.6-.9 1.6-.9 2.2 0M13.8 10c.6-.9 1.6-.9 2.2 0"/>'],
    ['cupido', '<path d="M12 16.8C8.4 14.1 6.6 12.3 6.6 10.1 6.6 8.5 7.8 7.2 9.4 7.2c1.1 0 2 .6 2.6 1.6.6-1 1.5-1.6 2.6-1.6 1.6 0 2.8 1.3 2.8 2.9 0 2.2-1.8 4-5.4 6.7zM3 21l5.6-5.6M17 7l4-4M17.5 3H21v3.5M3 17.5V21h3.5"/>'],
    ['infinito', '<path d="M12 12c-2-2.7-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.3 5.5-4s3.6-4 5.5-4a4 4 0 0 1 0 8c-1.9 0-3.5-1.3-5.5-4z"/>'],
    ['anel', '<circle cx="12" cy="15.5" r="6"/><path d="M9.5 6.5 12 9.5l2.5-3-1.2-2.5h-2.6zM9.5 6.5h5"/>'],
    ['papo', '<path d="M12 3.5c5 0 9 3.2 9 7.2s-4 7.2-9 7.2c-1 0-2-.1-2.9-.4L4.5 20l1-3.7C4 15 3 13 3 10.7 3 6.7 7 3.5 12 3.5zM12 13.3C9.9 11.7 8.85 10.7 8.85 9.4c0-.95.7-1.7 1.6-1.7.63 0 1.16.35 1.55.9.38-.55.9-.9 1.54-.9.91 0 1.6.73 1.6 1.7 0 1.3-1.05 2.3-3.15 3.9z"/>']
  ]
};

// Estilo "C · Dois tons" da galeria: desenhos alternam o acento do módulo e o cinza (--muted).
const STYLE_C = { id: 'C', cell: 110, size: 30, stroke: 1.4, rot: 14, jitter: .15, opacity: [.10, .065] };

// Escolha do usuário na galeria (v2.33.0). Cores = --event-glow/--muted e --friends-glow/--muted.
const MODULES = {
  eventos: { accent: '#9668ff', muted: '#aaa3b8', seed: 2025, intensity: 1.8, spacing: .85, size: 1.05, off: [] },
  amigos: { accent: '#f2c94c', muted: '#bdb49d', seed: 3112, intensity: 1, spacing: .8, size: 1, off: ['quebracabeca'] }
};

function rng(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const n = (v, d = 1) => +v.toFixed(d);

function buildTile(key, style = STYLE_C) {
  const mod = MODULES[key];
  const icons = ICONS[key].filter((icon) => !mod.off.includes(icon[0]));
  const cols = 4, rows = 4;
  const cell = style.cell * mod.spacing, size = style.size * mod.size;
  const W = n(cols * cell, 0), H = n(rows * cell, 0);
  const r = rng(mod.seed + style.id.charCodeAt(0));
  const order = icons.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const layers = [{ color: mod.accent, opacity: style.opacity[0] }, { color: mod.muted, opacity: style.opacity[1] }];
  const groups = layers.map(() => []);
  const s = size / 24, reach = size * .75;
  let k = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++, k++) {
    const x = (i + .5) * cell + (j % 2 ? cell / 2 : 0) + (r() - .5) * 2 * style.jitter * cell;
    const y = (j + .5) * cell + (r() - .5) * 2 * style.jitter * cell;
    const a = (r() - .5) * 2 * style.rot;
    const icon = order[k % order.length];
    const g = groups[k % 2];
    const bx = ((x % W) + W) % W;
    for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
      const cx = bx + dx, cy = y + dy;
      if (cx + reach < 0 || cx - reach > W || cy + reach < 0 || cy - reach > H) continue;
      g.push(`<g transform="translate(${n(cx)} ${n(cy)})rotate(${n(a, 0)})scale(${n(s, 3)})translate(-12 -12)">${icon[1]}</g>`);
    }
  }
  const body = layers.map((layer, idx) => `<g stroke="${layer.color}" opacity="${n(Math.min(1, layer.opacity * mod.intensity), 3)}">${groups[idx].join('')}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><!-- FunTime: gerado por scripts/fundos-build.cjs --><g fill="none" stroke-width="${n(style.stroke / s, 2)}" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>\n`;
}

if (require.main === module) {
  const dir = path.join(__dirname, '..', 'patterns');
  fs.mkdirSync(dir, { recursive: true });
  for (const key of Object.keys(MODULES)) {
    const svg = buildTile(key);
    fs.writeFileSync(path.join(dir, `${key}.svg`), svg);
    console.log(`patterns/${key}.svg: ${Buffer.byteLength(svg)} bytes`);
  }
}

module.exports = { buildTile };
