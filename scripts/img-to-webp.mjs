// Converte os PNGs grandes de public/ para WebP, gravando X.webp ao lado de X.png.
// Mantém os PNGs como fallback. Não redimensiona — só troca formato/compressão.
//
// Uso:  npm run img:webp     (requer devDependency `sharp`)
//   ou  npx -y -p sharp node scripts/img-to-webp.mjs
//
// Reexecutável: pula um WebP que já exista e esteja mais novo que o PNG de origem.

import { readdir, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', 'public')

// Pastas com sprites pesados que valem a conversão. Avatares (public/avatar)
// já são minúsculos e ficam de fora.
const DIRS = ['tamers', 'lvl 3', 'lvl 4']

const QUALITY = 82

let converted = 0
let skipped = 0
let savedBytes = 0

async function convertDir(rel) {
  const dir = join(ROOT, rel)
  let entries
  try {
    entries = await readdir(dir)
  } catch {
    console.warn(`(pulando ${rel}: pasta não encontrada)`)
    return
  }

  for (const name of entries) {
    if (extname(name).toLowerCase() !== '.png') continue
    const src = join(dir, name)
    const out = src.slice(0, -4) + '.webp'

    const srcStat = await stat(src)
    let outStat = null
    try { outStat = await stat(out) } catch { /* não existe ainda */ }

    if (outStat && outStat.mtimeMs >= srcStat.mtimeMs) {
      skipped++
      continue
    }

    const info = await sharp(src)
      .webp({ quality: QUALITY })
      .toFile(out)

    savedBytes += srcStat.size - info.size
    converted++
    const pct = Math.round((1 - info.size / srcStat.size) * 100)
    console.log(
      `${rel}/${name}: ${(srcStat.size / 1024).toFixed(0)} KB → ${(info.size / 1024).toFixed(0)} KB (-${pct}%)`
    )
  }
}

for (const d of DIRS) await convertDir(d)

console.log(
  `\nConcluído: ${converted} convertido(s), ${skipped} já atualizado(s). ` +
  `Economia: ${(savedBytes / 1024 / 1024).toFixed(1)} MB.`
)
