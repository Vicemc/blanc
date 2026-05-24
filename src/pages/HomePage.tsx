import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import styles from './HomePage.module.css'

// ===== Digivice SVG =====
// Os 13 digivices da imagem, cada um com cores de corpo + tela
const DIGIVICES = [
  // linha 1
  { body:'#b22222', trim:'#222', screen:'#1a1a1a', accent:'#e44' },   // vermelho-escuro
  { body:'#7c5cad', trim:'#999', screen:'#1a1a1a', accent:'#c8a' },   // roxo
  { body:'#e8e8e8', trim:'#aaa', screen:'#1a1a1a', accent:'#8db' },   // branco/cinza
  // linha 2
  { body:'#e07820', trim:'#444', screen:'#1a1a1a', accent:'#fc8' },   // laranja
  { body:'#3a7acc', trim:'#555', screen:'#1a1a1a', accent:'#8af' },   // azul
  { body:'#f4c0d0', trim:'#999', screen:'#1a1a1a', accent:'#fad' },   // rosa claro
  // linha 3
  { body:'#cc2244', trim:'#333', screen:'#1a1a1a', accent:'#f46' },   // vermelho-pink
  { body:'#1aadcc', trim:'#444', screen:'#1a1a1a', accent:'#4de' },   // ciano
  { body:'#ddb840', trim:'#555', screen:'#1a1a1a', accent:'#fd6' },   // dourado/amarelo
  // linha 4
  { body:'#eee030', trim:'#555', screen:'#1a1a1a', accent:'#ff6' },   // amarelo
  { body:'#44bb44', trim:'#333', screen:'#1a1a1a', accent:'#6e6' },   // verde
  { body:'#cccccc', trim:'#888', screen:'#1a1a1a', accent:'#bbb' },   // prata
  // linha 5
  { body:'#1a1a1a', trim:'#555', screen:'#1a1a1a', accent:'#666' },   // preto
]

function DigiviceSVG({ dv }: { dv: typeof DIGIVICES[0] }) {
  return (
    <svg viewBox="0 0 90 70" xmlns="http://www.w3.org/2000/svg" width="90" height="70">
      {/* corpo principal */}
      <rect x="8" y="4" width="74" height="54" rx="7" fill={dv.body} />
      <rect x="5" y="7" width="80" height="48" rx="8" fill={dv.body} />
      {/* borda/trim metálica */}
      <rect x="5" y="7" width="80" height="48" rx="8" fill="none" stroke={dv.trim} strokeWidth="2.5"/>
      {/* painel da tela */}
      <rect x="16" y="12" width="46" height="32" rx="4" fill="#111" />
      {/* tela verde */}
      <rect x="18" y="14" width="42" height="28" rx="3" fill="#1a2e1a" />
      <rect x="18" y="14" width="42" height="14" rx="3" fill="#1f381f" />
      {/* reflexo na tela */}
      <rect x="20" y="16" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.08)" />
      {/* texto -SURVIVE- na tela */}
      <text x="39" y="26" textAnchor="middle" fontFamily="'Arial Black', sans-serif" fontSize="5.5" fontWeight="900" fill={dv.accent} letterSpacing="0.5">-SURVIVE-</text>
      <text x="39" y="35" textAnchor="middle" fontFamily="monospace" fontSize="4" fill={dv.accent} opacity="0.6">DIGIMON</text>
      {/* botões lado direito */}
      <circle cx="73" cy="20" r="4" fill={dv.trim} opacity="0.8"/>
      <circle cx="73" cy="20" r="2.5" fill={dv.accent} opacity="0.7"/>
      <rect x="70" y="27" width="7" height="3" rx="1.5" fill={dv.trim} opacity="0.7"/>
      <rect x="70" y="33" width="7" height="3" rx="1.5" fill={dv.trim} opacity="0.7"/>
      {/* botões inferiores */}
      <rect x="20" y="49" width="8" height="4" rx="2" fill={dv.trim} opacity="0.7"/>
      <rect x="32" y="49" width="8" height="4" rx="2" fill={dv.trim} opacity="0.7"/>
      <rect x="44" y="49" width="8" height="4" rx="2" fill={dv.trim} opacity="0.7"/>
      {/* suporte / base */}
      <rect x="20" y="58" width="50" height="8" rx="4" fill={dv.body} opacity="0.7"/>
      <rect x="28" y="60" width="34" height="4" rx="2" fill={dv.trim} opacity="0.4"/>
      {/* highlight top */}
      <rect x="10" y="9" width="50" height="5" rx="3" fill="rgba(255,255,255,0.12)"/>
    </svg>
  )
}

// ===== Goggle SVG =====
function GogglesSVG() {
  return (
    <svg viewBox="0 0 260 200" xmlns="http://www.w3.org/2000/svg">
      {/* background sky gradient */}
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b8d4f0"/>
          <stop offset="100%" stopColor="#e8c870"/>
        </linearGradient>
        <linearGradient id="lensL" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8ab4d8" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#4a7a9b" stopOpacity="0.95"/>
        </linearGradient>
        <linearGradient id="lensR" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8ab4d8" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#4a7a9b" stopOpacity="0.95"/>
        </linearGradient>
        <radialGradient id="lensGlow" cx="35%" cy="30%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.5)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>
      <rect width="260" height="200" fill="url(#skyGrad)"/>
      {/* nuvens */}
      <ellipse cx="40" cy="40" rx="30" ry="14" fill="white" opacity="0.7"/>
      <ellipse cx="65" cy="34" rx="22" ry="12" fill="white" opacity="0.7"/>
      <ellipse cx="190" cy="55" rx="35" ry="15" fill="white" opacity="0.6"/>
      <ellipse cx="220" cy="48" rx="25" ry="13" fill="white" opacity="0.6"/>
      {/* strap das óculos */}
      <path d="M 18 100 Q 10 98 8 90 Q 6 82 16 80 L 72 78" stroke="#c8a850" strokeWidth="12" fill="none" strokeLinecap="round"/>
      <path d="M 242 100 Q 250 98 252 90 Q 254 82 244 80 L 188 78" stroke="#c8a850" strokeWidth="12" fill="none" strokeLinecap="round"/>
      {/* frame central das óculos */}
      <rect x="64" y="62" width="132" height="58" rx="12" fill="#1a1a1a"/>
      <path d="M 72 66 L 128 66 Q 130 66 130 72 L 130 114 Q 130 118 126 118 L 72 118 Q 66 118 64 112 L 64 74 Q 64 66 72 66 Z" fill="#2a2a2a"/>
      <path d="M 188 66 L 132 66 Q 130 66 130 72 L 130 114 Q 130 118 134 118 L 188 118 Q 194 118 196 112 L 196 74 Q 196 66 188 66 Z" fill="#2a2a2a"/>
      {/* lentes */}
      <path d="M 70 70 L 127 70 L 127 114 L 70 114 Q 66 114 66 110 L 66 74 Q 66 70 70 70 Z" fill="url(#lensL)"/>
      <path d="M 133 70 L 190 70 Q 194 70 194 74 L 194 110 Q 194 114 190 114 L 133 114 Z" fill="url(#lensR)"/>
      {/* reflexo nas lentes */}
      <ellipse cx="88" cy="82" rx="18" ry="8" fill="url(#lensGlow)" transform="rotate(-20,88,82)"/>
      <ellipse cx="152" cy="82" rx="18" ry="8" fill="url(#lensGlow)" transform="rotate(-20,152,82)"/>
      {/* borda dourada */}
      <path d="M 70 70 L 127 70 L 127 114 L 70 114 Q 66 114 66 110 L 66 74 Q 66 70 70 70 Z" fill="none" stroke="#c8a850" strokeWidth="2.5"/>
      <path d="M 133 70 L 190 70 Q 194 70 194 74 L 194 110 Q 194 114 190 114 L 133 114 Z" fill="none" stroke="#c8a850" strokeWidth="2.5"/>
      <rect x="127" y="86" width="6" height="8" rx="2" fill="#c8a850"/>
      {/* parte superior das óculos */}
      <rect x="66" y="58" width="128" height="14" rx="6" fill="#c8a850"/>
      <rect x="66" y="58" width="128" height="7" rx="6" fill="#e0bc64"/>
      {/* straps laterais detalhes */}
      <rect x="8" y="88" width="58" height="6" rx="3" fill="#b89838" opacity="0.8"/>
      <rect x="194" y="88" width="58" height="6" rx="3" fill="#b89838" opacity="0.8"/>
      {/* texto sutil */}
      <text x="130" y="148" textAnchor="middle" fontFamily="'Arial Black', sans-serif" fontSize="10" fontWeight="900" fill="#8a6820" letterSpacing="2" opacity="0.6">GOGGLE GIRL</text>
    </svg>
  )
}

// ===== Teatro SVG =====
function TeatroSVG() {
  return (
    <svg viewBox="0 0 260 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="stageFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1a0a"/>
          <stop offset="100%" stopColor="#0a0805"/>
        </linearGradient>
        <linearGradient id="curtainL" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#8b0000"/>
          <stop offset="60%" stopColor="#c0002a"/>
          <stop offset="100%" stopColor="#6b0000"/>
        </linearGradient>
        <linearGradient id="curtainR" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6b0000"/>
          <stop offset="40%" stopColor="#c0002a"/>
          <stop offset="100%" stopColor="#8b0000"/>
        </linearGradient>
        <linearGradient id="spotlight" cx="50%" cy="0%" r="50%" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#ffe066" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="#ffe066" stopOpacity="0"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="0%">
          <stop offset="0%" stopColor="#fffbe0" stopOpacity="0.7"/>
          <stop offset="100%" stopColor="#fffbe0" stopOpacity="0"/>
        </radialGradient>
      </defs>
      {/* fundo escuro do palco */}
      <rect width="260" height="200" fill="#0d0808"/>
      {/* luz do palco */}
      <path d="M 60 0 L 200 0 L 230 180 L 30 180 Z" fill="url(#spotlight)" opacity="0.5"/>
      {/* chão do palco */}
      <rect x="0" y="155" width="260" height="45" fill="url(#stageFloor)"/>
      {/* linhas do chão */}
      <line x1="0" y1="158" x2="260" y2="158" stroke="#3a2010" strokeWidth="1"/>
      <line x1="0" y1="165" x2="260" y2="165" stroke="#3a2010" strokeWidth="0.5" opacity="0.5"/>
      <line x1="0" y1="172" x2="260" y2="172" stroke="#3a2010" strokeWidth="0.5" opacity="0.3"/>
      {/* perspectiva do chão */}
      <line x1="130" y1="155" x2="30"  y2="200" stroke="#3a2010" strokeWidth="0.5" opacity="0.4"/>
      <line x1="130" y1="155" x2="80"  y2="200" stroke="#3a2010" strokeWidth="0.5" opacity="0.4"/>
      <line x1="130" y1="155" x2="180" y2="200" stroke="#3a2010" strokeWidth="0.5" opacity="0.4"/>
      <line x1="130" y1="155" x2="230" y2="200" stroke="#3a2010" strokeWidth="0.5" opacity="0.4"/>
      {/* moldura do palco - topo */}
      <rect x="0" y="0" width="260" height="22" fill="#1a0a04"/>
      <rect x="0" y="18" width="260" height="6" fill="#c8941a"/>
      <rect x="0" y="20" width="260" height="2" fill="#e0b830"/>
      {/* pelmet / borla */}
      {[0,20,40,60,80,100,120,140,160,180,200,220,240].map((x,i) => (
        <path key={i} d={`M ${x} 24 Q ${x+10} 38 ${x+20} 24`} fill="#8b0000" stroke="#6b0000" strokeWidth="1"/>
      ))}
      <path d="M 0 24 L 260 24 L 260 26 L 0 26 Z" fill="#c8941a"/>
      {/* CORTINA ESQUERDA */}
      <path d="M 0 22 Q 40 30 50 80 Q 58 130 45 155 L 0 155 Z" fill="url(#curtainL)"/>
      {/* dobras cortina esquerda */}
      <path d="M 10 22 Q 20 60 25 120 Q 30 140 28 155" fill="none" stroke="#6b0000" strokeWidth="2" opacity="0.6"/>
      <path d="M 25 22 Q 38 55 42 110 Q 46 135 40 155" fill="none" stroke="#6b0000" strokeWidth="2" opacity="0.5"/>
      <path d="M 40 22 Q 48 50 52 100 Q 55 130 50 155" fill="none" stroke="#6b0000" strokeWidth="1.5" opacity="0.4"/>
      {/* brilho cortina esquerda */}
      <path d="M 0 22 Q 15 35 18 90 Q 20 130 15 155 L 0 155 Z" fill="rgba(255,255,255,0.06)"/>
      {/* CORTINA DIREITA */}
      <path d="M 260 22 Q 220 30 210 80 Q 202 130 215 155 L 260 155 Z" fill="url(#curtainR)"/>
      {/* dobras cortina direita */}
      <path d="M 250 22 Q 240 60 235 120 Q 230 140 232 155" fill="none" stroke="#6b0000" strokeWidth="2" opacity="0.6"/>
      <path d="M 235 22 Q 222 55 218 110 Q 214 135 220 155" fill="none" stroke="#6b0000" strokeWidth="2" opacity="0.5"/>
      <path d="M 220 22 Q 212 50 208 100 Q 205 130 210 155" fill="none" stroke="#6b0000" strokeWidth="1.5" opacity="0.4"/>
      {/* brilho cortina direita */}
      <path d="M 260 22 Q 245 35 242 90 Q 240 130 245 155 L 260 155 Z" fill="rgba(255,255,255,0.06)"/>
      {/* borlas das cortinas */}
      <circle cx="50" cy="155" r="5" fill="#c8941a"/>
      <circle cx="50" cy="155" r="3" fill="#e0b830"/>
      <circle cx="210" cy="155" r="5" fill="#c8941a"/>
      <circle cx="210" cy="155" r="3" fill="#e0b830"/>
      {/* cordão que fecha as cortinas */}
      <path d="M 50 155 Q 130 170 210 155" stroke="#c8941a" strokeWidth="2" fill="none"/>
      {/* glow de luz no centro */}
      <ellipse cx="130" cy="50" rx="60" ry="40" fill="url(#glow)" opacity="0.4"/>
      {/* estrelas de luz no topo */}
      {[60,100,130,160,200].map((x,i) => (
        <circle key={i} cx={x} cy={10} r="1.5" fill="#ffe066" opacity="0.7"/>
      ))}
      {/* texto sutil */}
      <text x="130" y="145" textAnchor="middle" fontFamily="'Arial Black', sans-serif" fontSize="9" fontWeight="900" fill="#c8941a" letterSpacing="3" opacity="0.6">TEATRO</text>
    </svg>
  )
}

export default function HomePage() {
  // Escolhe digivice aleatório por sessão (memoizado)
  const dvIndex = useMemo(() => Math.floor(Math.random() * DIGIVICES.length), [])
  const dv = DIGIVICES[dvIndex]

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>Digimon<br />Survive</h1>
        <div className={styles.tag}>~A midnight summer's dream~</div>
      </div>
      <div className={styles.cards}>

        <Link to="/party" className={styles.card}>
          <div className={styles.thumb}>
            <div className={styles.dvWrap}>
              <DigiviceSVG dv={dv} />
            </div>
            <div className="grain" />
          </div>
          <h3>Party</h3>
          <p>Fichas dos tamers e de seus digimons</p>
        </Link>

        <Link to="/goggle" className={styles.card}>
          <div className={`${styles.thumb} ${styles.thumbGoggle}`}>
            <GogglesSVG />
            <div className="grain" />
          </div>
          <h3>Goggle Girl</h3>
          <p>Bestiário de cada Digimon e BUG encontrado, dividido por setor e classe.</p>
        </Link>

        <Link to="/teatro" className={styles.card}>
          <div className={`${styles.thumb} ${styles.thumbTeatro}`}>
            <TeatroSVG />
            <div className="grain" />
          </div>
          <h3>Teatro</h3>
          <p>Crie palcos e adicione atores para visualização rápida em combate.</p>
        </Link>

      </div>
      <div className={styles.sysRow}>
        <Link to="/sistema" className={styles.sysLink}>Sistema</Link>
      </div>
    </div>
  )
}
