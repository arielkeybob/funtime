// Exportação determinística de tamanhos; a arte é criada pela ferramenta de imagens.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const master = path.join(root, 'icons/funtime-master-v2.png');
async function main() {
  if (process.argv[2]) fs.copyFileSync(process.argv[2], master);
  for (const [name, size] of [['icon-192-v2.png',192],['icon-512-v2.png',512],['apple-touch-icon-v2.png',180],['favicon-32-v2.png',32]]) {
    await sharp(master).resize(size,size).png().toFile(path.join(root,'icons',name));
  }
  // Variante artística própria com fundo contínuo e margem para recorte.
  await sharp(path.join(root,'icons/funtime-maskable-master-v2.png')).resize(512,512).png()
    .toFile(path.join(root,'icons/icon-maskable-512-v2.png'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
