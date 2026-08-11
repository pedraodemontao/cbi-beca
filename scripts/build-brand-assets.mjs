/**
 * Gera todos os assets da marca a partir de UMA arte.
 *
 *   node scripts/build-brand-assets.mjs caminho/da/logo.jpg
 *
 * A arte que a Beca mandou é um JPEG com fundo preto chapado — sem alfa e sem
 * vetor. O recorte aqui é por luminância: o desenho é ouro claro e o fundo é
 * quase preto, então a própria luz do pixel vira o alfa.
 *
 * Existe como script (e não como passo do build) porque a logo muda uma vez por
 * ano, e regenerar à mão com `sips` — a única ferramenta de imagem que esta
 * máquina tem — não daria conta de alfa nem de ICO. O `sharp` já vem com o
 * Next, então não há dependência nova.
 */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];

if (!source) {
  console.error('uso: node scripts/build-brand-assets.mjs <arte.jpg>');
  process.exit(1);
}

/** Abaixo disso é fundo; acima é desenho cheio. Entre os dois, borda suave. */
const FLOOR = 26;
const CEIL = 96;

/** Preto da direção — o mesmo `--cbi-black` do design system. */
const BLACK = { r: 8, g: 8, b: 10, alpha: 1 };

async function cutout(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const p = i * info.channels;
    const [r, g, b] = [data[p], data[p + 1], data[p + 2]];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    const alpha =
      luma <= FLOOR
        ? 0
        : luma >= CEIL
          ? 255
          : Math.round(((luma - FLOOR) / (CEIL - FLOOR)) * 255);

    const q = i * 4;
    if (alpha === 0) continue;

    // Desmultiplica: pixel de borda é ouro misturado com o preto do fundo, e
    // sem dividir pelo alfa ele carrega esse preto pro fundo novo — vira um
    // halo escuro em volta da logo quando ela cai no tema claro.
    const k = 255 / alpha;
    out[q] = Math.min(255, Math.round(r * k));
    out[q + 1] = Math.min(255, Math.round(g * k));
    out[q + 2] = Math.min(255, Math.round(b * k));
    out[q + 3] = alpha;
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 1 })
    .png()
    .toBuffer();
}

/** Logo centralizada num quadrado opaco — é o que ícone de app precisa. */
async function badge(logo, size, coverage) {
  const inner = Math.round(size * coverage);
  const art = await sharp(logo)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const { width, height } = await sharp(art).metadata();

  return sharp({ create: { width: size, height: size, channels: 4, background: BLACK } })
    .composite([
      { input: art, top: Math.round((size - height) / 2), left: Math.round((size - width) / 2) },
    ])
    .png()
    .toBuffer();
}

const logo = await cutout(source);
const { width, height } = await sharp(logo).metadata();
console.log(`arte recortada: ${width}x${height}`);

/**
 * A marca da interface aparece em 34px (barra do topo) e 56px (login e erro).
 * 200px de altura cobre tela de 3x com folga; em 512 o arquivo ia a 174 kB e
 * era baixado em toda página. `palette` reduz pra PNG de 256 cores — o
 * gradiente do ouro tem banding em tamanho grande, mas no tamanho de uso não
 * há pixel onde ele apareça.
 */
const interfaceArt = (input) =>
  sharp(input).resize({ height: 200, fit: 'inside' }).png({ palette: true, compressionLevel: 9 });

// Marca dentro da interface, transparente, nos dois tons.
await interfaceArt(logo).toFile(`${ROOT}/public/brand-mark.png`);

// O ouro da arte mede 1,46:1 sobre o papel do tema claro — some. `modulate` e
// não `linear`: multiplicar os canais escurece mas lava a cor junto (a primeira
// tentativa saiu num marrom acinzentado de 4,17:1). Assim o tom médio fica em
// #846A0B, 4,89:1 sobre o papel — praticamente o `--cbi-gold-ink` do CSS — e o
// pixel mais claro ainda dá 3,45:1, acima dos 3:1 que elemento gráfico pede.
await interfaceArt(
  await sharp(logo).modulate({ brightness: 0.55, saturation: 1.3 }).toBuffer()
).toFile(`${ROOT}/public/brand-mark-light.png`);

// Ícones do app têm fundo preto: a arte foi desenhada assim, e ícone de tela de
// início precisa de fundo próprio.
await writeFile(`${ROOT}/public/icon-192.png`, await badge(logo, 192, 0.78));
await writeFile(`${ROOT}/public/icon-512.png`, await badge(logo, 512, 0.78));
// Maskable: 20% de folga pro recorte do Android não comer as letras.
await writeFile(`${ROOT}/public/icon-512-maskable.png`, await badge(logo, 512, 0.6));
// iOS não lida bem com alfa no apple-touch-icon: fundo opaco sempre.
await writeFile(`${ROOT}/src/app/apple-icon.png`, await badge(logo, 180, 0.78));

// favicon.ico com um PNG de 256 dentro — o formato aceita isso desde o Vista, e
// é o jeito de ter um ICO sem ferramenta de imagem instalada.
const png = await badge(logo, 256, 0.82);
const ico = Buffer.alloc(22 + png.length);
ico.writeUInt16LE(0, 0); // reservado
ico.writeUInt16LE(1, 2); // tipo: ícone
ico.writeUInt16LE(1, 4); // uma imagem só
ico.writeUInt8(0, 6); // largura 0 significa 256
ico.writeUInt8(0, 7); // altura 0 significa 256
ico.writeUInt8(0, 8); // cores na paleta
ico.writeUInt8(0, 9); // reservado
ico.writeUInt16LE(1, 10); // planos
ico.writeUInt16LE(32, 12); // bits por pixel
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18); // offset dos dados
png.copy(ico, 22);
await writeFile(`${ROOT}/src/app/favicon.ico`, ico);

console.log('assets gerados em public/ e src/app/');
