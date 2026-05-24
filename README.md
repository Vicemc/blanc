# Digimon Survive — Companion App
## Campanha: A Midnight Summer's Dream

### Como rodar

**Pré-requisitos:** Node.js ≥ 18, npm ≥ 9

```bash
npm install
npm run dev
# → http://localhost:5173
```

### Primeira execução

Ao abrir pela primeira vez, o app carrega automaticamente os dados de todos os Player Characters da campanha.

Se precisar resetar para os dados padrão:
```javascript
// No console do navegador (F12):
localStorage.removeItem('cheshire_characters')
// Depois recarregue a página
```

### Adicionar NPCs Fechadura / Bestiário

Edite `src/data/store.ts` → função `buildDefaultState()`.  
Seções marcadas com comentários `// NPCs Fechadura` e `// Bestiário`.  
Após editar, limpe o localStorage conforme acima.

### Player Characters

| Tamer | Cor | Digimon | EXP atual |
|-------|-----|---------|-----------|
| NAOKI Mochizuki | coral | Tinkermon → Witchmon | 6 |
| MORI Utsurogi | teal | Kudamon → Reppamon | 90 |
| MIKI Sawatari | purple | Blucomon → Paledramon | 63 |
| YURI Miyamoto | black | Wormmon (Leafmon↔Minomon↔Wormmon) | 54 |
| EISUKE Morikawa | gold | Solarmon → Guardromon (Gold) | 24 |
| SACHI Fujimura | rose | — (a revelar) | 96 |
