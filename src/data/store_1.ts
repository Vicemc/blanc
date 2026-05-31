// =============================================================================
// store_1.ts — Variant of store.ts that seeds buildDefaultState() from the
// JSON backup snapshot taken on 2026-05-30.
// DO NOT MODIFY store.ts — this file is standalone.
// =============================================================================

import type { AppState } from '../types';
import { idbLoad, idbSave, idbLoadImage } from './persistence';
import { TAMER_DEFAULT_IMAGES, DIGIMON_DEFAULT_IMAGES } from './images';

// ─── Re-exports from store.ts (all except the 4 overridden symbols) ──────────
export {
  attachExportImageKeys, exportStateToFile, importStateFromFile,
  runMigrations, saveState, findTamer, findDigimon, findBug,
  calcTamerDerived, calcDigimonDerived, xpCostAttribute, xpCostSkill,
  buyTamerAttribute, buyTamerSkill, buyDigimonAttribute,
  makeDefaultAttributes, makeEmptyStage, makeTamer, makeSlimLine, makeWildDigimon, makeBug, makeSign, makeStage,
  DEFAULT_TOKEN_DEFS, visKey, getVisLevel, isVisible, setVisibility,
  makeSkillTreePhase, buySkillTreeSkill, parseBestiaryText,
  pendingCost, pendingSkillCost,
} from './store';
export type { XpResult } from './store';
// Re-export image/persistence helpers directly (locally imported above)
export { idbLoadImage, idbListImageKeys, idbSaveImage } from './persistence';
export { DIGIMON_DEFAULT_IMAGES, TAMER_DEFAULT_IMAGES } from './images';

// ─── Private constants (copied from store.ts) ────────────────────────────────
const STORAGE_KEY = 'digimon_survive';

// ─── Private helpers (copied from store.ts) ──────────────────────────────────
function mergeWithDefaults(saved: AppState, defaults: AppState): AppState {
  const savedBugIds = new Set(saved.bugs?.map(b => b.id) ?? []);

  let savedSurvivors = saved.survivors ?? [];
  let savedTamers    = saved.tamers    ?? [];
  if (!savedSurvivors.some(sv => sv.name.toLowerCase().includes('yahiro'))) {
    const yahiroTamer = savedTamers.find(t => t.name.toLowerCase().includes('yahiro'));
    if (yahiroTamer) {
      const sv = defaults.survivors.find(s => s.name.toLowerCase().includes('yahiro'));
      const converted = {
        ...(sv ?? defaults.survivors[0]),
        id:       yahiroTamer.id.startsWith('t-') ? yahiroTamer.id.replace('t-', 'sv-') : `sv-${yahiroTamer.id}`,
        name:     yahiroTamer.name,
        surname:  yahiroTamer.surname,
        portrait: yahiroTamer.portrait,
        image:    yahiroTamer.image ?? null,
        imageKey: yahiroTamer.imageKey ?? null,
      };
      savedSurvivors = [...savedSurvivors, converted];
      savedTamers    = savedTamers.filter(t => t.id !== yahiroTamer.id);
    }
  }

  const survivorIds = new Set(savedSurvivors.map(sv => sv.id));
  const survivors = [
    ...savedSurvivors,
    ...defaults.survivors.filter(sv => !survivorIds.has(sv.id)),
  ];

  return {
    ...saved,
    survivors,
    stages:           saved.stages         ?? [],
    sectors:          saved.sectors        ?? defaults.sectors,
    bugFolders:       saved.bugFolders     ?? defaults.bugFolders,
    signs:            saved.signs          ?? defaults.signs,
    skillTree:        saved.skillTree      ?? defaults.skillTree,
    customClimas:     saved.customClimas     ?? [],
    customKeywords:   saved.customKeywords   ?? [],
    customConditions: saved.customConditions ?? [],
    jogressConfigs:   saved.jogressConfigs   ?? [],
    tokenDefs:        saved.tokenDefs      ?? [],
    visibility:       saved.visibility     ?? {},

    tamers: defaults.tamers.map(defaultTamer => {
      const savedTamer = saved.tamers?.find(t => t.id === defaultTamer.id);
      if (!savedTamer) return defaultTamer;
      const merged = { ...savedTamer, tamerSkills: defaultTamer.tamerSkills };
      if (merged.id === 't-mori' && (merged.attributes.Vigor < 4 || merged.status.HP.max < 9)) {
        const fixedAttrs = { ...merged.attributes, Vigor: 4 };
        const newHPMax = 9;
        const hpDiff = newHPMax - (merged.status.HP.max ?? 7);
        return {
          ...merged,
          attributes: fixedAttrs,
          status: {
            ...merged.status,
            HP: { v: Math.min(merged.status.HP.v + hpDiff, newHPMax), max: newHPMax },
          },
        };
      }
      return merged;
    }),

    bestiary: [
      ...defaults.bestiary.map(defaultLine => {
        const savedLine = saved.bestiary?.find(l => l.id === defaultLine.id);
        if (!savedLine) return defaultLine;
        const mergedLine = {
          ...savedLine,
          stages: defaultLine.stages.map((defStage, si) => {
            const savedStage = savedLine.stages[si];
            if (!savedStage) return defStage;
            return { ...savedStage, skills: defStage.skills };
          }),
        };
        if (mergedLine.id === 'd-kudamon-line') {
          return {
            ...mergedLine,
            stages: mergedLine.stages.map((s, i) => {
              let st = s;
              if (i === 1 && st.status.HP === 12) st = { ...st, status: { ...st.status, HP: 14 } };
              if (i === 2 && st.status.HP === 17) st = { ...st, status: { ...st.status, HP: 19 } };
              if (!st.locked && st.attributes.Vigor < 4) st = { ...st, attributes: { ...st.attributes, Vigor: 4 } };
              return st;
            }),
          };
        }
        return mergedLine;
      }),
      ...(saved.bestiary?.filter(d => !defaults.bestiary.some(dd => dd.id === d.id)) ?? []),
    ],

    bugs: [
      ...(saved.bugs ?? []),
      ...defaults.bugs.filter(b => !savedBugIds.has(b.id)),
    ],
  };
}

function applyDefaultImages(s: AppState): AppState {
  return {
    ...s,
    tamers: s.tamers.map(t =>
      (!t.image && !t.imageKey && TAMER_DEFAULT_IMAGES[t.id])
        ? { ...t, image: TAMER_DEFAULT_IMAGES[t.id] }
        : t
    ),
    bestiary: s.bestiary.map(d => {
      if (d.image || d.imageKey) return d;
      const key = `${d.id}:${d.currentStage}`;
      return DIGIMON_DEFAULT_IMAGES[key]
        ? { ...d, image: DIGIMON_DEFAULT_IMAGES[key] }
        : d;
    }),
  };
}

async function hydrateImages(s: AppState): Promise<AppState> {
  const hydrateFn = async <T extends { image: string | null; imageKey?: string | null }>(item: T): Promise<T> => {
    if (item.imageKey) {
      const dataUrl = await idbLoadImage(item.imageKey);
      if (dataUrl) return { ...item, image: dataUrl };
    }
    return item;
  };
  const hydrateTamer = async (t: typeof s.tamers[0]) => {
    if (t.imageKey) {
      const dataUrl = await idbLoadImage(t.imageKey);
      if (dataUrl) return { ...t, image: dataUrl };
    }
    if (!t.image && TAMER_DEFAULT_IMAGES[t.id]) {
      return { ...t, image: TAMER_DEFAULT_IMAGES[t.id] };
    }
    return t;
  };
  const hydrateDigimon = async (d: typeof s.bestiary[0]) => {
    let result = d;
    if (d.imageKey) {
      const dataUrl = await idbLoadImage(d.imageKey);
      if (dataUrl) result = { ...result, image: dataUrl };
    }
    if (!result.image && !result.imageKey) {
      const key = `${d.id}:${d.currentStage}`;
      if (DIGIMON_DEFAULT_IMAGES[key]) result = { ...result, image: DIGIMON_DEFAULT_IMAGES[key] };
    }
    const hydratedStages = await Promise.all(result.stages.map(async (stage, _i) => {
      if (stage.imageKey) {
        const dataUrl = await idbLoadImage(stage.imageKey);
        if (dataUrl) return { ...stage, image: dataUrl };
      }
      return stage;
    }));
    return { ...result, stages: hydratedStages };
  };

  return {
    ...s,
    tamers:    await Promise.all(s.tamers.map(hydrateTamer)),
    survivors: await Promise.all((s.survivors ?? []).map(hydrateFn)),
    bestiary:  await Promise.all(s.bestiary.map(hydrateDigimon)),
    bugs:      await Promise.all(s.bugs.map(hydrateFn)),
    signs:     await Promise.all((s.signs ?? []).map(hydrateFn)),
  };
}

export function buildDefaultState(): AppState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: AppState = {
  "bugs": [
    {
      "id": "b-ledo-trivial",
      "lore": "Baby II (Lvl 2) · Red Eraser",
      "name": "red.trivial",
      "class": "ledo",
      "color": "red",
      "image": null,
      "skills": [
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "Promise of Warmth",
          "effect": "Aplica 1 carga de [Haste] em si e ganha uma fraqueza agravada aleatória entre as afinidades que ainda não possui.",
          "alcance": "—",
          "keyword": "Efeito"
        },
        {
          "type": "passive",
          "title": "Memory Leak",
          "effect": "No início do seu turno, perca 1 de Memory.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "Heartbleed",
          "effect": "Qualquer efeito que faria o personagem perder Memory passa a causar ganho da mesma quantidade de Memory, em vez de redução.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "Cheers for the Dead",
          "effect": "Quando levar um golpe fatal, causa uma explosão que atinge todos dentro de um alcance em metros igual ao seu Deslocamento atual. O dano é igual ao HP que red.trivial tinha quando foi morto.",
          "keyword": "Passiva"
        }
      ],
      "status": {
        "HP": 5,
        "Defesa": 2,
        "Armadura": 0,
        "Iniciativa": 2,
        "Deslocamento": 5
      },
      "sectors": [
        1,
        2,
        3,
        4,
        5
      ],
      "affinity": {},
      "imageKey": null,
      "weakness": {
        "Letal (+2)": "Vacina",
        "Agravado (+3)": "Água, Gelo, Físico",
        "Resistente (-2)": "Data"
      },
      "attributes": {
        "Vigor": 2,
        "Força": 0,
        "Destreza": 2,
        "Presença": 0,
        "Raciocínio": 2,
        "Autocontrole": 0,
        "Inteligência": 2,
        "Manipulação": 2,
        "Perseverança": 0
      }
    },
    {
      "id": "b-ledo-low",
      "lore": "Child (Lvl 3) · Red Eraser",
      "name": "red.low",
      "class": "ledo",
      "color": "red",
      "image": null,
      "skills": [
        {
          "type": "reaction",
          "custo": "-1 Memory",
          "title": "Attack Juggling",
          "effect": "Quando um inimigo dentro do alcance fizer um ataque corpo a corpo contra um único alvo, pode ser ativada. Redireciona o ataque para um personagem dentro do alcance que tenha o tipo [Red].",
          "alcance": "5m",
          "keyword": "Efeito-Reação"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "dados": "Destreza + Fogo",
          "title": "Flame Juggler",
          "effect": "Dano fixo: 3. Aplica 2 + X cargas de [Burn] no inimigo escolhido; X é igual aos sucessos dos dados.",
          "alcance": "projétil 5m",
          "keyword": "Ataque"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "Spotlight for the New Life",
          "effect": "Recupera 3 HP de 1 aliado do tipo [Red]. Caso a cura ultrapasse o MAXHP, aumente o MAXHP de acordo com o excesso.",
          "alcance": "—",
          "keyword": "Efeito"
        },
        {
          "type": "passive",
          "title": "Digital Body",
          "effect": "Caso seja atacado por um humano, duplica a Defesa atual até o final do Round.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "Memory Leak",
          "effect": "No início do seu turno, perca 1 de Memory.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "Heartbleed",
          "effect": "Qualquer efeito que faria o personagem perder Memory passa a causar ganho da mesma quantidade de Memory, em vez de redução.",
          "keyword": "Passiva"
        }
      ],
      "status": {
        "HP": 10,
        "Defesa": 2,
        "Armadura": 0,
        "Iniciativa": 4,
        "Deslocamento": 10
      },
      "sectors": [
        1,
        2,
        3,
        4,
        5
      ],
      "affinity": {
        "Fogo": 3
      },
      "imageKey": null,
      "weakness": {
        "Letal (+2)": "Vacina",
        "Agravado (+3)": "Água, Gelo",
        "Resistente (-2)": "Data, Fogo"
      },
      "attributes": {
        "Vigor": 4,
        "Força": 2,
        "Destreza": 4,
        "Presença": 2,
        "Raciocínio": 2,
        "Autocontrole": 0,
        "Inteligência": 2,
        "Manipulação": 3,
        "Perseverança": 0
      }
    },
    {
      "id": "b-ledo-high",
      "lore": "Adult (Lvl 4) · Red Eraser",
      "name": "red.high",
      "class": "ledo",
      "color": "red",
      "image": null,
      "skills": [
        {
          "type": "action",
          "custo": "-2 Memory",
          "dados": "Manipulação + Enfraquecer",
          "title": "Masquerade",
          "effect": "Cooldown: 3 Turnos. Aplica 1 carga de [Charm] no alvo.",
          "alcance": "15m",
          "keyword": "Efeito"
        },
        {
          "type": "reaction",
          "custo": "-1 Memory",
          "title": "Main Attraction",
          "effect": "Quando um aliado escolher um personagem do tipo [Red] como alvo de um efeito, pode ser usada. [Blitz]. Aplica 1 carga de [Decoy] no alvo.",
          "alcance": "8m",
          "keyword": "Efeito-Reação"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "dados": "Presença + Fogo",
          "title": "Red Applause",
          "effect": "[Blast 1]. Dano fixo: 3. Aplica 4 + X cargas de [Burn] nos alvos atingidos; X = número de Erasers do tipo [Red] em batalha (excluindo o próprio usuário).",
          "alcance": "projétil 10m",
          "keyword": "Ataque"
        },
        {
          "type": "passive",
          "title": "Digital Body +",
          "effect": "Caso seja atacado por um humano ou um Digimon de nível inferior, duplica a Defesa atual até o final do Round.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "Memory Leak +",
          "effect": "No início do seu turno, perca 2 de Memory.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "Heartbleed",
          "effect": "Qualquer efeito que faria o personagem perder Memory passa a causar ganho da mesma quantidade de Memory, em vez de redução.",
          "keyword": "Passiva"
        }
      ],
      "status": {
        "HP": 20,
        "Defesa": 4,
        "Armadura": 0,
        "Iniciativa": 6,
        "Deslocamento": 13
      },
      "sectors": [
        1,
        2,
        3,
        4,
        5
      ],
      "affinity": {
        "Fogo": 3,
        "Enfraquecer": 2
      },
      "imageKey": null,
      "weakness": {
        "Imune": "[Charm]",
        "Letal (+2)": "Vacina",
        "Agravado (+3)": "Água, Gelo",
        "Resistente (-2)": "Data, Fogo"
      },
      "attributes": {
        "Vigor": 4,
        "Força": 2,
        "Destreza": 6,
        "Presença": 4,
        "Raciocínio": 4,
        "Autocontrole": 0,
        "Inteligência": 4,
        "Manipulação": 6,
        "Perseverança": 0
      }
    },
    {
      "id": "b-ledo-hood",
      "lore": "Adult (Lvl 4) · Red Eraser",
      "name": "red.hood",
      "class": "ledo",
      "color": "red",
      "image": null,
      "skills": [
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "Hooded Girls Never Run Away",
          "effect": "Cooldown: 5 Turnos. Iniciativa +2 e ganha uma ação extra em seus turnos (efetivo a partir do próximo Round). Ambos os efeitos duram 3 turnos.",
          "alcance": "—",
          "keyword": "Efeito"
        },
        {
          "type": "action",
          "custo": "-1 Memory ou -3 HP",
          "dados": "Força + Físico",
          "title": "Sucker Punch",
          "effect": "[Assassinate]. Dano fixo: 3. Pode ser ativada como Reação quando um inimigo estiver prestes a encerrar seu turno ainda com ações disponíveis. Nesse caso, recebe [Blitz]. Se acertar, uma ação não utilizada do inimigo é gasta.",
          "alcance": "projétil 8m",
          "keyword": "Ataque"
        },
        {
          "type": "action",
          "custo": "-2 Memory ou -6 HP",
          "dados": "Força + Físico",
          "title": "Brutality",
          "effect": "Dano fixo: 5. Se o alvo tiver mais Defesa do que a Armadura atual, duplique o dano e o [Security Attack] desse ataque.",
          "alcance": "corpo a corpo 1m",
          "keyword": "Ataque"
        },
        {
          "type": "passive",
          "title": "Digital Body +",
          "effect": "Caso seja atacado por um humano ou um Digimon de nível inferior, duplica a Defesa atual até o final do Round.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "Memory Leak +",
          "effect": "No início do seu turno, perca 2 de Memory.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "Heartbleed",
          "effect": "Qualquer efeito que faria o personagem perder Memory passa a causar ganho da mesma quantidade de Memory, em vez de redução.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "You Must Become Strong",
          "effect": "Fixa sua Defesa em 1. Quando receber um ataque fatal, sobrevive com 1 HP e fica imune a dano por ataques até o final do Round. No início do próximo Round, aumenta o dano de seus ataques em +2 permanentemente. Pode ser ativado até 3 vezes por batalha.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "Fire Does Not Burn You",
          "effect": "Quando for ser afetado por uma Condição Negativa, perde 1 de Armadura e cancela o efeito.",
          "keyword": "Passiva"
        }
      ],
      "status": {
        "HP": 40,
        "Defesa": 1,
        "Armadura": 3,
        "Iniciativa": 3,
        "Deslocamento": 15
      },
      "sectors": [
        1,
        2,
        3,
        4,
        5
      ],
      "affinity": {
        "Físico": 5
      },
      "imageKey": null,
      "weakness": {
        "Imune": "[Burn]",
        "Letal (+2)": "Vacina",
        "Agravado (+3)": "Gelo, [Charm]",
        "Resistente (-2)": "Data, Físico"
      },
      "attributes": {
        "Vigor": 6,
        "Força": 6,
        "Destreza": 3,
        "Presença": 6,
        "Raciocínio": 0,
        "Autocontrole": 0,
        "Inteligência": 0,
        "Manipulação": 0,
        "Perseverança": 4
      }
    },
    {
      "id": "b-chi-chevalier",
      "lore": "Baby II (Lvl 2) · Green Eraser",
      "name": "green.chevalier",
      "class": "chi",
      "color": "green",
      "image": null,
      "skills": [
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "Inspire",
          "effect": "Concede [Blocker] e Defesa +1 ao alvo (1 aliado do tipo [Green]) durante 3 turnos.",
          "alcance": "—",
          "keyword": "Efeito"
        },
        {
          "type": "passive",
          "title": "Domain Dweller",
          "effect": "No início do seu turno, caso esteja dentro de um Domain, Memory +2.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "En Garde!",
          "effect": "Ao ser atacado por um inimigo, ao invés de reduzir os dados dele com sua Defesa, rode Destreza + Defesa contra ele. Caso vença, reduza a Defesa do alvo em -2 permanentemente (some após [Defense Break] ou green.chevalier ser derrotado). Caso perca, diminua sua Defesa e receba dano normalmente.",
          "keyword": "Passiva"
        }
      ],
      "status": {
        "HP": 7,
        "Defesa": 2,
        "Armadura": 0,
        "Iniciativa": 4,
        "Deslocamento": 6
      },
      "sectors": [
        1,
        2,
        3,
        4,
        5
      ],
      "affinity": {},
      "imageKey": null,
      "weakness": {
        "Letal (+2)": "Data",
        "Agravado (+3)": "Enfraquecer, Trevas, [Condições do tipo Ferimento]",
        "Resistente (-2)": "Vírus"
      },
      "attributes": {
        "Vigor": 0,
        "Força": 0,
        "Destreza": 2,
        "Presença": 0,
        "Raciocínio": 2,
        "Autocontrole": 2,
        "Inteligência": 0,
        "Manipulação": 0,
        "Perseverança": 2
      }
    },
    {
      "id": "b-chi-priestess",
      "lore": "Adult (Lvl 4) · Green Eraser",
      "name": "green.priestess",
      "class": "chi",
      "color": "green",
      "image": null,
      "skills": [
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "Safe Zone",
          "effect": "Cooldown: 5 Turnos. [Blast 3]. Aumenta a afinidade à Resistência dos aliados em +2 e, caso tenham [Blocker], também aumenta a Defesa em +3. Ambos os efeitos duram 3 turnos.",
          "alcance": "15m",
          "keyword": "Efeito"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "dados": "Inteligência + Cura",
          "title": "Green Gradation",
          "effect": "Recupera 2 + X de HP do aliado escolhido (X = sucessos). Com 2+ sucessos, aplica 1 carga de [Blocker] no aliado.",
          "alcance": "15m",
          "keyword": "Efeito"
        },
        {
          "type": "action",
          "custo": "-1 Memory (Lvl 2) ou -2 Memory (Lvl 3)",
          "title": "Evolution Code",
          "effect": "Evolui 1 aliado do tipo [Green] abaixo do Lvl 4 para o próximo nível, recupera totalmente seu HP e fixa a Memory dele em 3.",
          "alcance": "15m",
          "keyword": "Efeito"
        },
        {
          "type": "passive",
          "title": "Digital Body +",
          "effect": "Caso seja atacado por um humano ou um Digimon de nível inferior, duplica sua Defesa atual até o final do Round.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "Domain Dweller",
          "effect": "No início do seu turno, caso esteja dentro de um Domain, Memory +2.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "Simple Domain",
          "effect": "No início do Round, caso não haja Domain ativo, cria um [Simple Domain] 20×20. Conta como Domain para aliados do tipo [Green]. Some quando outro Domain for ativado.",
          "keyword": "Passiva"
        }
      ],
      "status": {
        "HP": 20,
        "Defesa": 2,
        "Armadura": 1,
        "Iniciativa": 8,
        "Deslocamento": 7
      },
      "sectors": [
        1,
        2,
        3,
        4,
        5
      ],
      "affinity": {
        "Luz": 2,
        "Cura": 2,
        "Físico": 1
      },
      "imageKey": null,
      "weakness": {
        "Imune": "[Curse]",
        "Letal (+2)": "Data",
        "Agravado (+3)": "Enfraquecer, [Burn]",
        "Resistente (-2)": "Vírus, Luz"
      },
      "attributes": {
        "Vigor": 0,
        "Força": 0,
        "Destreza": 2,
        "Presença": 2,
        "Raciocínio": 2,
        "Autocontrole": 6,
        "Inteligência": 6,
        "Manipulação": 6,
        "Perseverança": 2
      }
    }
  ],
  "signs": [],
  "stages": [
    {
      "id": "stage-mpkq1o4p",
      "log": [],
      "clima": null,
      "notes": "",
      "sides": {
        "allies": [
          {
            "id": "t-sachi",
            "kind": "human"
          }
        ],
        "enemies": []
      },
      "title": "Hollow Bastion ",
      "clocks": [],
      "subtitle": "Um teste do Cybervice, e a fortaza vazia",
      "createdAt": 1779684239977,
      "tokenMeta": {},
      "actorStates": {
        "tamer:t-sachi": {
          "hp": 7,
          "defesa": 0,
          "hp_max": 7,
          "armadura": 0,
          "conditions": [],
          "defesa_base": 0
        }
      },
      "roundCurrent": 0,
      "initiativeOrder": [
        {
          "id": "ini-tamer:t-sachi-mprqqkqv-1a65",
          "init": 13,
          "actorKey": "tamer:t-sachi"
        }
      ],
      "activeInitiativeId": "ini-tamer:t-sachi-mprqqkqv-1a65"
    },
    {
      "id": "stage-mpot3oqr",
      "log": [],
      "clima": null,
      "notes": "",
      "sides": {
        "allies": [
          {
            "id": "sv-yahiro",
            "kind": "survivor"
          },
          {
            "id": "sv-mei-mpoljsxe",
            "kind": "survivor"
          }
        ],
        "enemies": []
      },
      "title": "Teste de Laranja",
      "clocks": [],
      "subtitle": "Imagine se Yahiro Akugetsu jogasse El Shard",
      "createdAt": 1779931237635,
      "tokenMeta": {},
      "actorStates": {
        "survivor:sv-yahiro": {
          "hp": 7,
          "defesa": 4,
          "hp_max": 7,
          "armadura": 0,
          "conditions": [
            {
              "id": "marker-mpoz7z3g",
              "max": 1,
              "color": "teal",
              "label": "__toggle__Sakura Whimsical Stroll",
              "filled": 1
            },
            {
              "id": "marker-mpoz809v",
              "max": 1,
              "color": "teal",
              "label": "__toggle__Sakura-zensen",
              "filled": 1
            }
          ],
          "defesa_base": 0
        },
        "survivor:sv-mei-mpoljsxe": {
          "hp": 6,
          "defesa": 0,
          "hp_max": 6,
          "armadura": 0,
          "conditions": [],
          "defesa_base": 0
        }
      },
      "roundCurrent": 0,
      "activeActorKey": "survivor:sv-mei-mpoljsxe",
      "initiativeOrder": [
        {
          "id": "ini-survivor:sv-yahiro-mprpsagr-35um",
          "init": 9,
          "actorKey": "survivor:sv-yahiro"
        },
        {
          "id": "ini-survivor:sv-mei-mpoljsxe-mprpsagr-zcgk",
          "init": 7,
          "actorKey": "survivor:sv-mei-mpoljsxe"
        }
      ],
      "activeInitiativeId": "ini-survivor:sv-yahiro-mprpsagr-35um"
    }
  ],
  "tamers": [
    {
      "id": "t-naoki",
      "xp": 6,
      "age": 17,
      "name": "NAOKI",
      "sign": "Capricórnio",
      "image": null,
      "voice": "Yuuki Ono",
      "height": 192,
      "skills": {
        "Mental": {
          "E.G.": 0,
          "P.S.": 0,
          "Ciência": 0,
          "Folclore": 0,
          "Notívago": 2,
          "Construção": 2,
          "Investigação": 2
        },
        "Social": {
          "Sorte": 1,
          "Empatia": 2,
          "Expressão": 2,
          "Persuasão": 2,
          "Socializar": 0,
          "Subterfúgio": 0,
          "Intimidação": 3
        },
        "Físico": {
          "Briga": 4,
          "Esquiva": 4,
          "Limpeza": 0,
          "Atletismo": 3,
          "Culinária": 0,
          "Furtividade": 0,
          "Sobrevivência": 2
        }
      },
      "status": {
        "HP": {
          "v": 8,
          "max": 8
        },
        "Memory": {
          "v": 3,
          "max": 10
        },
        "Digisoul": {
          "v": 5,
          "max": 5
        },
        "Autoridade": 2,
        "Iniciativa": 8,
        "Deslocamento": 15
      },
      "surname": "Mochizuki",
      "tagline": "Minha alma ruge",
      "xpSpent": 0,
      "birthday": "25 de Dezembro de 2004",
      "imageKey": "img-t-naoki-1780153283432",
      "portrait": "red",
      "digimonId": "d-tinkermon-line",
      "attributes": {
        "Vigor": 3,
        "Força": 5,
        "Destreza": 5,
        "Presença": 4,
        "Raciocínio": 2,
        "Autocontrole": 2,
        "Inteligência": 2,
        "Manipulação": 2,
        "Perseverança": 3
      },
      "tamerSkills": [
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "COMIGO, TINK!",
          "effect": "Caso a Memory de Naoki seja 2 ou menos, aumente-a para 3.",
          "target": "Naoki",
          "keyword": "Charge"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "TRACE: ON!",
          "effect": "Ataques que o alvo fizer não irão ativar o efeito de passivas com [Digital Body] no nome, esse efeito dura 3 rounds. Caso o alvo tenha sido Naoki, durante sua próxima ação apenas, um ataque dele ganhará [Blitz].",
          "target": "Naoki ou 1 Aliado humano",
          "keyword": "His Rules"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "EU NÃO VOU ME CURVAR!",
          "effect": "Quando Naoki acerta um ataque no inimigo, essa Skill ganha [Blitz]. Marca um inimigo; o inimigo marcado receberá +2 de dano de ataques físicos, a marca dura 3 Rounds.",
          "target": "1 Inimigo",
          "keyword": "Mark of Aggression"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "ESSE É O NOSSO CONTRA ATAQUE!",
          "effect": "Dá +1 sucesso para as rolagens de ataque do alvo. Caso o alvo tenha sofrido dano no Round anterior, aumenta em +1 o número de sucessos.",
          "target": "Naoki ou 1 Aliado",
          "keyword": "Aggressive Beat"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "QUEIME, MINH'ALMA!",
          "effect": "[Security Attack +1]. Esse efeito dura 3 Rounds. Caso o alvo seja Naoki, dura 5 Rounds.",
          "target": "Naoki ou 1 Digimon Aliado",
          "keyword": "Burn, My Soul"
        },
        {
          "type": "passive",
          "title": "MINHA ALMA RUGE",
          "effect": "Caso o HP atual de Tinkermon ou Naoki seja 50% ou menos de seu MAXHP, aumenta os dados das rolagens de ataque de Tinkermon e suas evoluções em +2.",
          "keyword": "Raging Soul"
        },
        {
          "type": "passive",
          "title": "CHEGA PRA LÁ!",
          "effect": "Libera [Counter] como uma reação para Naoki.",
          "keyword": "Instinct"
        },
        {
          "type": "passive",
          "title": "Ruja comigo, TINK!",
          "effect": "Durante o seu turno, caso Naoki tenha causado dano em um inimigo, a ação de digievoluir Tinkermon tem [Blitz] e seu custo é reduzido em -1.",
          "keyword": "Digisoul of Bravery"
        }
      ]
    },
    {
      "id": "t-eisuke",
      "xp": 24,
      "age": 17,
      "name": "EISUKE",
      "sign": "Escorpião",
      "image": null,
      "voice": "Kouki Uchiyama",
      "height": 185,
      "skills": {
        "Mental": {
          "E.G.": 1,
          "P.S.": 3,
          "Ciência": 1,
          "Folclore": 1,
          "Notívago": 2,
          "Construção": 1,
          "Investigação": 2
        },
        "Social": {
          "Sorte": 1,
          "Empatia": 4,
          "Expressão": 2,
          "Persuasão": 3,
          "Socializar": 1,
          "Subterfúgio": 3,
          "Intimidação": 1
        },
        "Físico": {
          "Briga": 1,
          "Esquiva": 2,
          "Limpeza": 2,
          "Atletismo": 1,
          "Culinária": 3,
          "Furtividade": 1,
          "Sobrevivência": 1
        }
      },
      "status": {
        "HP": {
          "v": 8,
          "max": 8
        },
        "Memory": {
          "v": 3,
          "max": 10
        },
        "Digisoul": {
          "v": 6,
          "max": 6
        },
        "Autoridade": 2,
        "Iniciativa": 9,
        "Deslocamento": 11
      },
      "surname": "Morikawa",
      "tagline": "Antes do meu corpo ceder.",
      "xpSpent": 0,
      "birthday": "31 de Outubro de 2004",
      "imageKey": "img-t-eisuke-1780153283432",
      "portrait": "amber",
      "digimonId": "d-solarmon-line",
      "attributes": {
        "Vigor": 3,
        "Força": 2,
        "Destreza": 4,
        "Presença": 2,
        "Raciocínio": 4,
        "Autocontrole": 4,
        "Inteligência": 2,
        "Manipulação": 2,
        "Perseverança": 2
      },
      "tamerSkills": [
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Meditate",
          "effect": "Caso a Memory de Eisuke seja 2 ou menos, aumente-a para 3.",
          "target": "Eisuke",
          "keyword": "Charge"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "Shield Set: Aegis",
          "effect": "Marca um Digimon aliado. O Digimon marcado tem [Blocker]. A marca é perdida quando o alvo usar o [Blocker] dessa Skill.",
          "target": "1 Digimon Aliado que não tenha Blocker",
          "keyword": "Mark of Protection"
        },
        {
          "type": "action",
          "custo": "-X Memory",
          "title": "Shield Set: Rho Aias",
          "effect": "Essa Skill pode ser ativada durante qualquer momento do turno de Eisuke ou do inimigo. X é igual à quantidade de Memory gasta [mín.1, máx. 3]. Adiciona Defesa: X e [Blocker] para Eisuke. Após usar o [Blocker] que essa Skill deu, os efeitos dela somem.",
          "target": "Eisuke",
          "keyword": "My Body as a Shield"
        },
        {
          "type": "action",
          "custo": "-X Memory",
          "title": "Nanghait",
          "effect": "X é igual à quantidade de Memory gasta [mín.1, máx. 3]. Dá Defesa +X para um Digimon aliado e reduz o dano de seus ataques em -X. Esses efeitos duram 1 Round.",
          "target": "1 Digimon aliado",
          "keyword": "Stagnation"
        },
        {
          "type": "reaction",
          "custo": "-1 Memory",
          "title": "And their Dreams continue...",
          "effect": "Quando um Digimon aliado sofrer dano fatal, Eisuke pode ativar essa Skill. O Digimon aliado irá sobreviver com 1 de HP, e caso esteja conectado a um Digivice, [Save].",
          "target": "1 Digimon Aliado",
          "keyword": "Message from the Village of Beginnings"
        },
        {
          "type": "passive",
          "title": "Deflect",
          "effect": "Quando um inimigo falhar um ataque contra um Digimon aliado, Eisuke irá rolar a Defesa atual do Digimon aliado e causará dano ao inimigo que errou o ataque de acordo com o número de sucessos dessa rolagem.",
          "keyword": "Deflect"
        },
        {
          "type": "passive",
          "title": "Shield Maintenance",
          "effect": "No início do turno de Eisuke, caso ele tenha usado [Blocker] no Round anterior, Memory +1.",
          "keyword": "Shield Maintenance"
        },
        {
          "type": "passive",
          "title": "Before My Body Submits",
          "effect": "Enquanto Eisuke estiver sob o efeito de [My Body as Shield], ele recebe os efeitos dessa Skill: Defesa +1 e caso a rolagem do inimigo ainda seja 6d10 ou mais após o cálculo de redução da Defesa, reduz mais 3 dados na rolagem de ataque do inimigo.",
          "keyword": "Before My Body Submits",
          "toggleBonus": {
            "statusBonus": {
              "Defesa": 1
            }
          }
        }
      ]
    },
    {
      "id": "t-miki",
      "xp": 63,
      "age": 17,
      "name": "MIKI",
      "sign": "Aquário",
      "image": null,
      "voice": "Ikue Ohtani",
      "height": 160,
      "skills": {
        "Mental": {
          "E.G.": 1,
          "P.S.": 0,
          "Ciência": 0,
          "Folclore": 4,
          "Notívago": 1,
          "Construção": 0,
          "Investigação": 1
        },
        "Social": {
          "Sorte": 4,
          "Empatia": 3,
          "Expressão": 5,
          "Persuasão": 2,
          "Socializar": 0,
          "Subterfúgio": 1,
          "Intimidação": 0
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 2,
          "Limpeza": 0,
          "Atletismo": 1,
          "Culinária": 0,
          "Furtividade": 2,
          "Sobrevivência": 0
        }
      },
      "status": {
        "HP": {
          "v": 7,
          "max": 7
        },
        "Memory": {
          "v": 3,
          "max": 10
        },
        "Digisoul": {
          "v": 6,
          "max": 6
        },
        "Autoridade": 2,
        "Iniciativa": 7,
        "Deslocamento": 10
      },
      "surname": "Sawatari",
      "tagline": "O show deve continuar.",
      "xpSpent": 0,
      "birthday": "03 de Fevereiro de 2005",
      "imageKey": "img-t-miki-1780153283432",
      "portrait": "purple",
      "digimonId": "d-blucomon-line",
      "attributes": {
        "Vigor": 2,
        "Força": 2,
        "Destreza": 3,
        "Presença": 2,
        "Raciocínio": 3,
        "Autocontrole": 3,
        "Inteligência": 2,
        "Manipulação": 2,
        "Perseverança": 3
      },
      "tamerSkills": [
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Charge",
          "effect": "Caso a Memory de Miki seja 2 ou menos, aumente-a para 3.",
          "target": "Miki",
          "keyword": "Charge"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "dados": "Destreza + Expressão",
          "title": "Glossary of Magic: Needle-Through-Arm",
          "effect": "Aplica 1 carga de [Bind] ou [Paralysis] no alvo. Em caso de Crítico, aplique uma carga extra da Condição escolhida.",
          "target": "1 Inimigo",
          "keyword": "Glossary of Magic"
        },
        {
          "type": "action",
          "custo": "-X Memory",
          "title": "Glossary of Magic: Linking Rings",
          "effect": "X é igual à quantidade de Memory gasta [mín. 1, máx. 3]; aumenta os dados de ataques Físicos de Blucomon em +X e diminui o Deslocamento de Blucomon em -X; ambos os efeitos duram 3 Rounds.",
          "target": "Blucomon",
          "keyword": "Glossary of Magic"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "Glossary of Magic: Quick-change",
          "effect": "Escolha uma classe de atributos [Poder, Refinamento ou Resistência], então mude o valor de um dos atributos dessa classe para 1, e aumente o valor de outro para 3. Essas mudanças duram 1 Round.",
          "target": "1 Digimon aliado",
          "keyword": "Glossary of Magic"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "Glossary of Magic: Levitation Illusion",
          "effect": "Aplica 3 cargas de [Flight] a 1 aliado. Se o alvo tiver sido um Digimon não-Data, reduza a Defesa e a Armadura dele para 0 durante o efeito. Não é possível ter mais de 1 alvo afetado por essa Skill ao mesmo tempo.",
          "target": "1 Aliado",
          "keyword": "Glossary of Magic"
        },
        {
          "type": "reaction",
          "custo": "-2 Memory",
          "title": "Glossary of Magic: Magical Hats",
          "effect": "Quando um inimigo designar Blucomon como alvo de um ataque, Miki pode ativar essa Skill. Miki escolhe um número de 1 a 4 e força o inimigo a rolar 1d4; se o inimigo não tirar o número escolhido por Miki, o ataque errará. Se o inimigo acertar, Miki recupera 1 de Memory.",
          "target": "Blucomon",
          "keyword": "Glossary of Magic"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "dados": "Destreza + Expressão",
          "title": "Glossary of Magic: Fire Breathing",
          "effect": "Aplica 4 + X cargas de [Burn] no alvo; X é igual a quantidade de sucessos tirados no dado.",
          "target": "1 Inimigo",
          "keyword": "Glossary of Magic"
        },
        {
          "type": "passive",
          "title": "The Show Must Go On",
          "effect": "No início do Round, caso tenha usado uma ação que tenha [Glossary of Magic] no nome durante o Round anterior, Memory +1.",
          "keyword": "The Show Must Go On"
        }
      ]
    },
    {
      "id": "t-yuri",
      "xp": 54,
      "age": 17,
      "name": "YURI",
      "sign": "Aquário",
      "image": null,
      "voice": "Ogura Yui",
      "height": 150,
      "skills": {
        "Mental": {
          "E.G.": 3,
          "P.S.": 0,
          "Ciência": 3,
          "Folclore": 1,
          "Notívago": 2,
          "Construção": 1,
          "Investigação": 3
        },
        "Social": {
          "Sorte": 0,
          "Empatia": 2,
          "Expressão": 3,
          "Persuasão": 1,
          "Socializar": 3,
          "Subterfúgio": 2,
          "Intimidação": 2
        },
        "Físico": {
          "Briga": 1,
          "Esquiva": 3,
          "Limpeza": 1,
          "Atletismo": 1,
          "Culinária": 0,
          "Furtividade": 0,
          "Sobrevivência": 4
        }
      },
      "status": {
        "HP": {
          "v": 7,
          "max": 7
        },
        "Memory": {
          "v": 3,
          "max": 10
        },
        "Digisoul": {
          "v": 5,
          "max": 5
        },
        "Autoridade": 2,
        "Iniciativa": 7,
        "Deslocamento": 9
      },
      "surname": "Miyamoto",
      "tagline": "Desenho o que os olhos não conseguem ver.",
      "xpSpent": 0,
      "birthday": "29 de Janeiro de 2005",
      "imageKey": "img-t-yuri-1780153283432",
      "portrait": "black",
      "digimonId": "d-wormmon-line",
      "attributes": {
        "Vigor": 2,
        "Força": 1,
        "Destreza": 3,
        "Presença": 3,
        "Raciocínio": 3,
        "Autocontrole": 3,
        "Inteligência": 4,
        "Manipulação": 1,
        "Perseverança": 2
      },
      "tamerSkills": [
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Charge",
          "effect": "Caso a Memory de Yuri seja 2 ou menos, aumente-a pra 3.",
          "target": "Yuri",
          "keyword": "Charge"
        },
        {
          "type": "reaction",
          "custo": "-2 Memory",
          "title": "Superego: Perfect Impression",
          "effect": "Quando Yuri ou 1 aliado fizer uma rolagem, Yuri pode ativar essa Skill. Adiciona +1 sucesso ao resultado da rolagem. Caso o alvo tenha sido [Yuri] ou [Wormmon], o efeito muda para +2 sucessos.",
          "target": "Yuri ou 1 Aliado",
          "keyword": "Superego"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "Ego: Gaze, Guilty Iris",
          "effect": "Aplica 2 cargas de [Decoy] para o alvo. Caso Wormmon vá receber um ataque que irá zerar o HP dela, Yuri pode ativar essa Skill como uma Reação Livre; redirecione o ataque para outro alvo que esteja dentro do alcance do ataque inimigo.",
          "target": "1 Digimon aliado",
          "keyword": "Ego"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "dados": "Inteligência + Folclore",
          "title": "Superego: Penetrating Needle",
          "effect": "Aplica [Security Attack -1] no alvo, esse efeito dura 3 Rounds.",
          "target": "1 Inimigo",
          "keyword": "Superego"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "Ego: Overachieving Puppet",
          "effect": "Aplica [Reboot +1] em Yuri ou 1 aliado humano. Caso o alvo tenha sido Yuri, o custo dessa Skill é 0 e ganha [Blitz]. Não é possível ter mais de um alvo afetado por essa Skill ao mesmo tempo.",
          "target": "Yuri ou 1 aliado humano",
          "keyword": "Ego"
        },
        {
          "type": "reaction",
          "custo": "-1 Memory",
          "title": "Superego: Clawing Owl",
          "effect": "Quando um inimigo usar um ataque ou efeito, Yuri pode ativar essa Skill. Aplica [Delay] no ataque ou efeito do alvo.",
          "target": "1 Inimigo",
          "keyword": "Superego"
        },
        {
          "type": "passive",
          "title": "Id: Fragile Perception",
          "effect": "Anula o efeito de redução de atributos de [Worm Bait].",
          "keyword": "Id"
        },
        {
          "type": "passive",
          "title": "Ego: Enchained Apprenticeship",
          "effect": "No início da batalha, Yuri escolhe um aliado humano; a pessoa escolhida será tratado como um [Apprentice] para as Skills de Yuri. No início do turno de Yuri, se ela tiver menos Memory que seu [Apprentice], Yuri recebe Memory +1. Se tanto Yuri quanto seu [Apprentice] tiverem 0 de Memory, ambos ganham Memory +1.",
          "keyword": "Ego"
        }
      ]
    },
    {
      "id": "t-sachi",
      "xp": 96,
      "age": 18,
      "name": "SACHI",
      "sign": "Peixes",
      "image": null,
      "voice": "Rie Takahashi",
      "height": 161,
      "skills": {
        "Mental": {
          "E.G.": 1,
          "P.S.": 1,
          "Ciência": 1,
          "Folclore": 1,
          "Notívago": 1,
          "Construção": 1,
          "Investigação": 2
        },
        "Social": {
          "Sorte": 2,
          "Empatia": 5,
          "Expressão": 0,
          "Persuasão": 0,
          "Socializar": 1,
          "Subterfúgio": 0,
          "Intimidação": 1
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 1,
          "Limpeza": 2,
          "Atletismo": 0,
          "Culinária": 1,
          "Furtividade": 0,
          "Sobrevivência": 0
        }
      },
      "status": {
        "HP": {
          "v": 7,
          "max": 7
        },
        "Memory": {
          "v": 3,
          "max": 10
        },
        "Digisoul": {
          "v": 8,
          "max": 8
        },
        "Autoridade": 2,
        "Iniciativa": 7,
        "Deslocamento": 9
      },
      "surname": "Fujimura",
      "tagline": "Toda história merece ser contada.",
      "xpSpent": 0,
      "birthday": "29 de Fevereiro de 2005",
      "imageKey": "img-t-sachi-1780153283432",
      "portrait": "pink",
      "digimonId": null,
      "attributes": {
        "Vigor": 2,
        "Força": 1,
        "Destreza": 3,
        "Presença": 3,
        "Raciocínio": 2,
        "Autocontrole": 3,
        "Inteligência": 3,
        "Manipulação": 1,
        "Perseverança": 5
      },
      "tamerSkills": [
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Charge",
          "effect": "Caso a Memory de Sachi seja 2 ou menos, aumente-a para 3.",
          "target": "Sachi",
          "keyword": "Charge"
        },
        {
          "type": "reaction",
          "custo": "-X Memory",
          "title": "Storywriter",
          "effect": "Cooldown: 1 Round. Quando um aliado humano usar uma Skill que custe Memory, Sachi pode ativar essa Skill. Sachi pagará o custo de Memory da Skill do aliado em seu lugar.",
          "keyword": "Storywriter"
        },
        {
          "type": "reaction",
          "custo": "-2 Memory",
          "title": "A Story about all of you",
          "effect": "Quando um aliado humano fizer uma rolagem, Sachi pode ativar essa Skill. Caso a rolagem tenha menos de 7 dados, Sachi adiciona sua [Empatia] à rolagem; caso a rolagem tenha 7 dados ou mais, Sachi permite que o aliado rerolle X dados, com X sendo sua [Empatia].",
          "keyword": "A Story about all of you"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "Stage Out",
          "effect": "Também pode ser ativado durante o início do Round. Efeitos de Memory que fossem afetar Sachi até o final desse Round serão redirecionados para o aliado escolhido por ela.",
          "target": "1 Aliado humano",
          "keyword": "Stage Out"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "Puppet Theater",
          "effect": "Sachi invoca um [Puppet Token / Lv.3] adjacente a ela e pelos próximos 3 Rounds, no final do turno dela, Sachi pode invocar um [Puppet Token Lv.3] como uma Ação Livre e sem pagar o custo. Enquanto [Puppet Theater] estiver ativo, Sachi não pode usar essa Skill de novo.",
          "keyword": "Puppet Theater"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "Catharsis",
          "effect": "Sachi invoca um [Enhanced Puppet Token / Lv.4] adjacente à ela e escolhe um [Token] aliado em campo; quando o [Token] escolhido fizer seu próximo ataque, o ataque dele acertará garantido, dados só serão rolados para definir quanto de dano foi causado caso o ataque não tenha dano fixo.",
          "keyword": "Catharsis"
        },
        {
          "type": "passive",
          "title": "Spectator's Chair",
          "effect": "No início do turno de Sachi, caso Sachi ou sua Digimon não tenham feito ataques no Round anterior, ela irá curar 40% de sua [Empatia] como HP para todos os aliados humanos na batalha que ela consiga ver.",
          "keyword": "Spectator's Chair"
        },
        {
          "type": "passive",
          "title": "Storyteller's Mask",
          "effect": "Quando [Spectator's Chair] ativar, permite que Sachi faça uma cura extra para o aliado com menor HP na batalha — em caso de empate, Sachi escolhe — que ela consiga ver.",
          "keyword": "Storyteller's Mask"
        }
      ]
    },
    {
      "id": "t-mori",
      "xp": 90,
      "age": 25,
      "name": "MORI",
      "sign": "Peixes",
      "image": null,
      "voice": "Shinnosuke Tachibana",
      "height": 185,
      "skills": {
        "Mental": {
          "E.G.": 3,
          "P.S.": 3,
          "Ciência": 0,
          "Folclore": 2,
          "Notívago": 1,
          "Construção": 0,
          "Investigação": 0
        },
        "Social": {
          "Sorte": 0,
          "Empatia": 2,
          "Expressão": 4,
          "Persuasão": 0,
          "Socializar": 2,
          "Subterfúgio": 3,
          "Intimidação": 4
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 0,
          "Limpeza": 0,
          "Atletismo": 0,
          "Culinária": 4,
          "Furtividade": 0,
          "Sobrevivência": 0
        }
      },
      "status": {
        "HP": {
          "v": 9,
          "max": 9
        },
        "Memory": {
          "v": 3,
          "max": 10
        },
        "Digisoul": {
          "v": 6,
          "max": 6
        },
        "Autoridade": 1,
        "Iniciativa": 6,
        "Deslocamento": 8
      },
      "surname": "Utsurogi",
      "tagline": "Adulto e Professor",
      "xpSpent": 0,
      "birthday": "03 de Março de 1997",
      "portrait": "teal",
      "digimonId": "d-kudamon-line",
      "attributes": {
        "Vigor": 4,
        "Força": 1,
        "Destreza": 2,
        "Presença": 1,
        "Raciocínio": 3,
        "Autocontrole": 3,
        "Inteligência": 4,
        "Manipulação": 4,
        "Perseverança": 3
      },
      "tamerSkills": [
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Charge",
          "effect": "Caso a Memory de Mori seja 2 ou menos, aumente-a para 3.",
          "target": "Mori",
          "keyword": "Charge"
        },
        {
          "type": "reaction",
          "custo": "-2 Memory",
          "title": "Nama-miko Monogatari",
          "effect": "Quando um aliado ou inimigo atacar, Mori pode ativar essa Skill. Adicione +1 dado na rolagem caso seja um aliado ou diminua -1 dado na rolagem caso seja um inimigo. Se houver um inimigo afetado por uma Condição negativa na batalha, aumenta em +1 a quantidade de dados adicionados ou removidos.",
          "target": "1 Aliado ou 1 Inimigo",
          "keyword": "Nama-miko Monogatari"
        },
        {
          "type": "action",
          "custo": "-4 Memory",
          "title": "Mekura-oni",
          "effect": "Duplica a afinidade atual a [Enfraquecer] de um Digimon aliado durante 3 Rounds.",
          "target": "1 Digimon aliado",
          "keyword": "Mekura-oni"
        },
        {
          "type": "passive",
          "title": "Shiki",
          "effect": "No início do Round, escolha um inimigo; X é igual ao número de Condições [máx.2] que o inimigo escolhido por Mori tem. No início do turno de Kudamon, aumenta Defesa e [Security Attack] em +X. Esse efeito é desativado ao final do Round.",
          "keyword": "Shiki",
          "toggleBonus": {
            "xBonus": {
              "xMax": 2,
              "label": "X (Condições do inimigo)"
            },
            "statusBonus": {
              "Defesa": 1,
              "SecurityAttack": 1
            }
          }
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "dados": "Inteligência + Primeiros Socorros",
          "title": "Moribito",
          "effect": "Para ativar essa Skill, é necessário desativar uma Condição negativa de um inimigo a escolha de Mori. Recupere HP de 1 aliado de acordo com o número de sucessos + 3.",
          "target": "1 Aliado",
          "keyword": "Moribito"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "Onnamen",
          "effect": "Aplica [Phantasm] em um Digimon aliado.",
          "target": "1 Digimon aliado",
          "keyword": "Onnamen"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "dados": "Destreza + Folclore",
          "title": "Kakushi Ken: Oni no Tsume",
          "effect": "Aplica 8 + X cargas de [Bleed] no alvo; X é igual a quantidade de sucessos tirados no dado.",
          "target": "1 Inimigo",
          "keyword": "Kakushi Ken"
        },
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Nise no En: Shui",
          "effect": "Mori escolhe uma Skill de ação e causa X de dano em Kudamon e suas evoluções; X é equivalente ao custo de Memory da Skill escolhida multiplicado por 2. Até o final desse Round, a Skill escolhida terá seu custo reduzido para 0 e terá [Blitz].",
          "target": "Mori",
          "keyword": "Nise no En"
        }
      ],
      "imageKey": "img-t-mori-1780153283432"
    },
    {
      "id": "t-hare",
      "xp": 80,
      "age": 17,
      "name": "HARE",
      "sign": "Libra",
      "image": null,
      "voice": "Akemi Kanda",
      "height": 165,
      "skills": {
        "Mental": {
          "E.G.": 0,
          "P.S.": 1,
          "Ciência": 0,
          "Folclore": 1,
          "Notívago": 1,
          "Construção": 1,
          "Investigação": 0
        },
        "Social": {
          "Sorte": 1,
          "Empatia": 4,
          "Expressão": 2,
          "Persuasão": 0,
          "Socializar": 4,
          "Subterfúgio": 0,
          "Intimidação": 2
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 0,
          "Limpeza": 2,
          "Atletismo": 2,
          "Culinária": 2,
          "Furtividade": 0,
          "Sobrevivência": 1
        }
      },
      "status": {
        "HP": {
          "v": 8,
          "max": 8
        },
        "Memory": {
          "v": 3,
          "max": 10
        },
        "Digisoul": {
          "v": 5,
          "max": 5
        },
        "Autoridade": 2,
        "Iniciativa": 5,
        "Deslocamento": 9
      },
      "surname": "Ouhara",
      "tagline": "Domain of Sky.",
      "xpSpent": 0,
      "birthday": "1 de Outubro",
      "imageKey": "img-t-hare-1780153283432",
      "portrait": "orange",
      "digimonId": "d-toyagumon-line",
      "attributes": {
        "Vigor": 3,
        "Força": 2,
        "Destreza": 2,
        "Presença": 5,
        "Raciocínio": 2,
        "Autocontrole": 2,
        "Inteligência": 1,
        "Manipulação": 1,
        "Perseverança": 3
      },
      "tamerSkills": [
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Domain of Sky",
          "effect": "Ativa o Domain de Hare e libera o uso das [Digital Gate Skills]. Enquanto estiver ativo, [Humanos] são imunes a ataques.",
          "keyword": "Domain"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "Goggle Girl",
          "effect": "Libera a ficha do alvo analisado.",
          "target": "1 personagem não analisado",
          "keyword": "Goggle Girl"
        },
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Jogress: Sky & Oblivion",
          "effect": "Requerimento: [Domain of Sky] + [Domain of Oblivion]. Tanto Hibito quanto Hare podem ativar essa Skill. Escolha uma Skill Passiva que recupere Memory de cada Domain. As Skills escolhidas são herdadas pelo [Domain of Time]. Em seguida, ative o [Domain of Time].",
          "keyword": "Jogress"
        },
        {
          "type": "action",
          "custo": "-3 Memory",
          "title": "Sunny Day",
          "effect": "Muda o clima para [Intense Sunlight]. Esse efeito dura 5 Rounds.",
          "keyword": "Domain of Sky"
        },
        {
          "type": "action",
          "custo": "-3 Memory",
          "title": "Foggy Day",
          "effect": "Muda o clima para [Dense Fog]. Esse efeito dura 5 Rounds.",
          "keyword": "Domain of Sky"
        },
        {
          "type": "action",
          "custo": "-3 Memory",
          "title": "Rainy Day",
          "effect": "Muda o clima para [Heavy Rain]. Esse efeito dura 5 Rounds.",
          "keyword": "Domain of Sky"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "Weather Digimental",
          "effect": "Caso o clima tenha sido causado por uma Skill com \"Day\" no nome, o custo é 0. Aplica 1 carga de [Armor Evolution] no Digimon escolhido e libera [Armor Purge] como reação livre para Hare.",
          "target": "Toy Agumon, Blucomon, Tinkermon, Solarmon, Kudamon ou Wormmon",
          "keyword": "Domain of Sky"
        },
        {
          "type": "action",
          "custo": "-3 Memory",
          "title": "Sky Memory Boost",
          "effect": "Não pode ser usado fora de combate. Ativa uma Skill de Hare com \"Day\" no nome sem pagar o custo, depois entra em [Delay]; ao sair do [Delay], Memory +2 para Hare e os aliados escolhidos.",
          "target": "Hare + 2 Aliados Humanos",
          "keyword": "Domain of Sky"
        },
        {
          "type": "passive",
          "title": "Skygazing",
          "effect": "No início do Round, caso o clima seja [Clear Skies], Memory +1 para Hare e todos os aliados humanos dentro do Domain.",
          "keyword": "Domain of Sky"
        },
        {
          "type": "passive",
          "title": "Weather Forecast",
          "effect": "No início do Round, caso o clima tenha sido alterado no Round anterior, Memory +1 para Hare e todos os aliados humanos dentro do Domain.",
          "keyword": "Domain of Sky"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "dados": "Perseverança + Primeiros Socorros",
          "title": "Sunny Wind",
          "effect": "Caso o clima seja [Intense Sunlight], o custo é 0. Remova 2 + X cargas de um Relógio de Ferimento do aliado escolhido e cure 1 + X de HP; X = sucessos obtidos.",
          "target": "Hare ou 1 Aliado",
          "keyword": "Domain of Time"
        },
        {
          "type": "passive",
          "title": "Sun-Viewing Recital",
          "effect": "Quando cargas de [Burn] forem aplicadas em personagens, Memory +1 para Hare, Hibito e todos os aliados dentro do [Domain of Time]. Máximo duas vezes por Round.",
          "keyword": "Domain of Time"
        },
        {
          "type": "passive",
          "title": "Faintly, like the Summer Wind",
          "effect": "Aumenta as rolagens de [Perseverança] de Hare em +2 dados enquanto equipada com [Matoi: Koyomi]. Sempre que usar uma Skill com apenas 1 aliado como alvo, o aliado recebe +2 dados em rolagens de [Perseverança] até o final do Round.",
          "keyword": "Domain of Time"
        },
        {
          "type": "passive",
          "title": "The Flame That Counts the Years",
          "effect": "Enquanto esse Domain estiver ativo, [Humanos] são imunes a ataques. No final do Round, 3 personagens aleatórios são afetados por 4 cargas de [Burn].",
          "keyword": "Domain of Time"
        }
      ]
    },
    {
      "id": "t-kanade",
      "xp": 85,
      "age": 17,
      "name": "KANADE",
      "sign": "Peixes",
      "image": null,
      "voice": "Kana Asumi",
      "height": 157,
      "skills": {
        "Mental": {
          "E.G.": 2,
          "P.S.": 2,
          "Ciência": 2,
          "Folclore": 0,
          "Notívago": 0,
          "Construção": 2,
          "Investigação": 0
        },
        "Social": {
          "Sorte": 0,
          "Empatia": 2,
          "Expressão": 4,
          "Persuasão": 0,
          "Socializar": 3,
          "Subterfúgio": 2,
          "Intimidação": 0
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 0,
          "Limpeza": 1,
          "Atletismo": 0,
          "Culinária": 1,
          "Furtividade": 2,
          "Sobrevivência": 1
        }
      },
      "status": {
        "HP": {
          "v": 8,
          "max": 8
        },
        "Memory": {
          "v": 3,
          "max": 10
        },
        "Digisoul": {
          "v": 3,
          "max": 3
        },
        "Autoridade": 2,
        "Iniciativa": 6,
        "Deslocamento": 10
      },
      "surname": "Hankei",
      "tagline": "Domain of Suffocation.",
      "xpSpent": 0,
      "birthday": "19 de Fevereiro",
      "imageKey": "t-kanade.png",
      "portrait": "butter",
      "digimonId": "d-penmon-line",
      "attributes": {
        "Vigor": 3,
        "Força": 1,
        "Destreza": 4,
        "Presença": 3,
        "Raciocínio": 3,
        "Autocontrole": 1,
        "Inteligência": 3,
        "Manipulação": 2,
        "Perseverança": 2
      },
      "tamerSkills": [
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Domain of Suffocation",
          "effect": "Ativa o Digital Gate de Kanade. Libera o uso das [Digital Gate Skills]. Enquanto estiver ativo, [Humanos] são imunes a ataques.",
          "keyword": "Domain"
        },
        {
          "type": "action",
          "custo": "-5 HP para todos os Digimons aliados",
          "title": "Desperate Escape",
          "effect": "Kanade e seus aliados são transportados para a zona segura mais próxima e fogem da batalha. Se não houver zona segura no alcance, a Skill falha, mas o custo ainda é pago.",
          "target": "Todos os aliados",
          "keyword": "Fuga"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "dados": "Inteligência + Primeiros Socorros + Cura",
          "title": "Mikazuki",
          "effect": "Recupera HP do aliado de acordo com os sucessos + 3.",
          "target": "1 Aliado sem HP completo",
          "keyword": "Domain of Suffocation"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "A Deal with Dagomon",
          "effect": "Aplica 10 cargas de [Curse] no Digimon e aumenta em +10 o MAXHP dele, curando essa quantidade logo em seguida. Se o [Curse] acabar, o aumento de HP é desativado. Só 1 Digimon afetado por vez.",
          "target": "1 Digimon aliado",
          "keyword": "Domain of Suffocation"
        },
        {
          "type": "action",
          "custo": "-3 Memory",
          "title": "Suffocating Memory Boost",
          "effect": "Não pode ser usado fora de combate. Reduz o HP dos Digimons escolhidos em -50% do HP atual, então entra em [Delay]; ao sair do [Delay], Memory +2 para Kanade e os aliados escolhidos.",
          "target": "Kanade + 2 aliados humanos",
          "keyword": "Domain of Suffocation"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "Air Purifier",
          "effect": "Reduz o HP do Digimon em -20% do MAXHP e limpa 1 Condição Negativa. Se o clima for [Heavy Rain], a redução é evitada e o alvo recupera HP equivalente à afinidade Cura de Kanade.",
          "target": "1 Digimon Aliado com Condição Negativa",
          "keyword": "Domain of Suffocation"
        },
        {
          "type": "passive",
          "title": "Emergency Oxygen",
          "effect": "No início do Round, caso o HP de um Digimon aliado não esteja completo, Memory +1 para Kanade e todos os aliados humanos dentro do Domain.",
          "keyword": "Domain of Suffocation"
        },
        {
          "type": "passive",
          "title": "Breath Control",
          "effect": "No início do Round, caso o HP de um Digimon aliado esteja acima da metade, Memory +1 para Kanade e todos os aliados humanos dentro do Domain.",
          "keyword": "Domain of Suffocation"
        },
        {
          "type": "passive",
          "title": "A Glimmer in the Ocean",
          "effect": "Libera a afinidade [Cura] para Kanade. Adiciona [Cura] a todas as rolagens que recuperem HP.",
          "keyword": "Domain of Suffocation",
          "alwaysOn": {
            "affinityBonus": {
              "Cura": 1
            }
          }
        }
      ]
    },
    {
      "id": "t-shinra",
      "xp": 80,
      "age": 18,
      "name": "SHINRA",
      "sign": "Virgem",
      "image": null,
      "voice": "Tsubasa Yonaga",
      "height": 170,
      "skills": {
        "Mental": {
          "E.G.": 2,
          "P.S.": 1,
          "Ciência": 2,
          "Folclore": 4,
          "Notívago": 2,
          "Construção": 0,
          "Investigação": 0
        },
        "Social": {
          "Sorte": 2,
          "Empatia": 2,
          "Expressão": 0,
          "Persuasão": 0,
          "Socializar": 0,
          "Subterfúgio": 0,
          "Intimidação": 0
        },
        "Físico": {
          "Briga": 2,
          "Esquiva": 3,
          "Limpeza": 1,
          "Atletismo": 3,
          "Culinária": 2,
          "Furtividade": 0,
          "Sobrevivência": 0
        }
      },
      "status": {
        "HP": {
          "v": 8,
          "max": 8
        },
        "Memory": {
          "v": 3,
          "max": 10
        },
        "Digisoul": {
          "v": 5,
          "max": 5
        },
        "Autoridade": 2,
        "Iniciativa": 5,
        "Deslocamento": 10
      },
      "surname": "Sorakado",
      "tagline": "Domain of Nature.",
      "xpSpent": 0,
      "birthday": "8 de Setembro",
      "imageKey": "img-t-shinra-1780153283432",
      "portrait": "green",
      "digimonId": "d-floramon-line",
      "attributes": {
        "Vigor": 3,
        "Força": 3,
        "Destreza": 2,
        "Presença": 3,
        "Raciocínio": 2,
        "Autocontrole": 2,
        "Inteligência": 2,
        "Manipulação": 1,
        "Perseverança": 3
      },
      "tamerSkills": [
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Domain of Nature",
          "effect": "Ativa o Domain de Shinra e libera o uso das [Digital Gate Skills]. Enquanto estiver ativo, [Humanos] são imunes a ataques.",
          "keyword": "Domain"
        },
        {
          "type": "action",
          "custo": "-3 Memory",
          "dados": "Vigor + Folclore",
          "title": "Hedge of Thorns",
          "effect": "[Blast 2]. Ignora Defesa. Acumula o dano total e distribui como cura entre os aliados de Shinra (exceto Shinra e Floramon).",
          "target": "Todos os inimigos",
          "keyword": "Domain of Nature"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "The Boy who took the Sword",
          "effect": "Cria a espada [La Vie en Rose]. Durante o turno de Shinra, caso a espada não esteja com ele, pode chamá-la de volta como ação livre. Ao final da batalha, a espada é desfeita.",
          "keyword": "Domain of Nature"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "dados": "Raciocínio + Folclore",
          "title": "Serene Fragrance",
          "effect": "Reduz o número de sucessos das rolagens do inimigo em -1 durante 1 Round.",
          "target": "1 Inimigo",
          "keyword": "Domain of Nature"
        },
        {
          "type": "action",
          "custo": "-3 Memory",
          "title": "In Natura Memory Boost",
          "effect": "Não pode ser usado fora de combate. Ganha Queen's Favor +3, então entra em [Delay]; ao sair do [Delay], Memory +2 para Shinra e os aliados escolhidos.",
          "target": "Shinra + 2 aliados humanos",
          "keyword": "Domain of Nature"
        },
        {
          "type": "action",
          "custo": "-3 Memory",
          "title": "Earth's Kiss",
          "effect": "Pelos próximos 3 Rounds, no início de cada Round, recupera 10% do MAXHP de Shinra e seus aliados. Se o clima for [Intense Sunlight], a cura é 20%.",
          "target": "Todos os aliados",
          "keyword": "Domain of Nature"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "Earth's Boon",
          "effect": "Shinra escolhe um ataque do Digimon; toda vez que esse ataque for usado, o Digimon recupera 3 HP. Se o alvo for Floramon, ataques com [La Vie en Rose] também são afetados. Se o clima for [Intense Sunlight], a recuperação aumenta +2.",
          "target": "1 Digimon Aliado",
          "keyword": "Domain of Nature"
        },
        {
          "type": "passive",
          "title": "Narcissism",
          "effect": "No início do Round, caso o HP de Shinra e Floramon esteja completo, Memory +1 para Shinra e todos os aliados dentro do Domain.",
          "keyword": "Domain of Nature"
        },
        {
          "type": "passive",
          "title": "Queendom",
          "effect": "A rainha do Domain é invocada no início da batalha e adiciona a barra Queen's Favor [máx. 10]. Para cada sucesso nas rolagens de Shinra, ganha Queen's Favor. No início do Round, pode gastar Queen's Favor em múltiplos de 5 para dar Memory +1 para Shinra e todos os aliados dentro do Domain.",
          "keyword": "Domain of Nature"
        }
      ]
    },
    {
      "id": "t-kumo",
      "xp": 82,
      "age": 18,
      "name": "KUMO",
      "sign": "Gêmeos",
      "image": null,
      "voice": "Romi Park",
      "height": 174,
      "skills": {
        "Mental": {
          "E.G.": 0,
          "P.S.": 0,
          "Ciência": 0,
          "Folclore": 2,
          "Notívago": 2,
          "Construção": 0,
          "Investigação": 3
        },
        "Social": {
          "Sorte": 0,
          "Empatia": 0,
          "Expressão": 1,
          "Persuasão": 4,
          "Socializar": 0,
          "Subterfúgio": 4,
          "Intimidação": 2
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 1,
          "Limpeza": 0,
          "Atletismo": 0,
          "Culinária": 0,
          "Furtividade": 3,
          "Sobrevivência": 0
        }
      },
      "status": {
        "HP": {
          "v": 7,
          "max": 7
        },
        "Memory": {
          "v": 3,
          "max": 10
        },
        "Digisoul": {
          "v": 6,
          "max": 6
        },
        "Autoridade": 2,
        "Iniciativa": 9,
        "Deslocamento": 10
      },
      "surname": "Sumeragi",
      "tagline": "Domain of Logic.",
      "xpSpent": 0,
      "birthday": "29 de Maio",
      "imageKey": "img-t-kumo-1780153283432",
      "portrait": "indigo",
      "digimonId": "d-hyokomon-line",
      "attributes": {
        "Vigor": 2,
        "Força": 1,
        "Destreza": 4,
        "Presença": 1,
        "Raciocínio": 3,
        "Autocontrole": 4,
        "Inteligência": 2,
        "Manipulação": 4,
        "Perseverança": 2
      },
      "tamerSkills": [
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Domain of Logic",
          "effect": "Ativa o Domain de Kumo e libera o uso das [Digital Gate Skills]. Enquanto estiver ativo, [Humanos] são imunes a ataques.",
          "keyword": "Domain"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "dados": "Destreza + Expressão",
          "title": "Graffiti: Cannon",
          "effect": "Aplica 3 cargas de [Mist] no inimigo escolhido.",
          "target": "1 Inimigo",
          "keyword": "Domain of Logic"
        },
        {
          "type": "action",
          "custo": "-X Memory",
          "title": "Overheating",
          "effect": "X é o custo pago [mín.1, máx.3]. Aumenta o dano dos ataques em +X, mas o Digimon se torna o último na ordem de turnos e não pode mudar sua posição. Dura 3 Rounds.",
          "target": "1 Digimon aliado",
          "keyword": "Domain of Logic"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "Rat Gambit",
          "effect": "Diminui a dificuldade mínima para sucesso para 6 e reduz -3 dados das rolagens do aliado escolhido. Ambos os efeitos duram 3 Rounds.",
          "target": "1 Aliado",
          "keyword": "Domain of Logic"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "Black Book: Throw-Up",
          "effect": "Aplica 1 carga de [Haste] no Digimon escolhido.",
          "target": "1 Digimon Aliado",
          "keyword": "Domain of Logic"
        },
        {
          "type": "action",
          "custo": "-3 Memory",
          "title": "Logic Memory Boost",
          "effect": "Não pode ser usado fora de combate. Ativa uma Skill de Kumo com \"Graffiti\" no nome sem pagar o custo, então entra em [Delay]; ao sair do [Delay], Memory +2 para Kumo e os aliados escolhidos.",
          "target": "Kumo + 2 Humanos Aliados",
          "keyword": "Domain of Logic"
        },
        {
          "type": "passive",
          "title": "Intangible Asset: Rivalrous",
          "effect": "No início do Round, caso haja pelo menos 1 inimigo afetado por uma Condição Negativa causada por Kumo ou aliados, Memory +1 para Kumo e todos os aliados dentro do Domain.",
          "keyword": "Domain of Logic"
        },
        {
          "type": "passive",
          "title": "Intangible Asset: Goodwill",
          "effect": "No início do Round, caso haja pelo menos 1 aliado afetado por uma Condição Negativa causada por um inimigo, Memory +1 para Kumo e todos os aliados dentro do Domain.",
          "keyword": "Domain of Logic"
        },
        {
          "type": "passive",
          "title": "Co-Sign Asset",
          "effect": "No início do Round, Kumo escolhe um aliado com 4 ou mais de Memory e aplica 1 carga de [Haste] nele. Só 1 aliado afetado por vez.",
          "keyword": "Domain of Logic"
        }
      ]
    },
    {
      "id": "t-emi",
      "xp": 86,
      "age": 18,
      "name": "EMI",
      "sign": "Escorpião",
      "image": null,
      "voice": "Shion Wakayama",
      "height": 161,
      "skills": {
        "Mental": {
          "E.G.": 1,
          "P.S.": 0,
          "Ciência": 1,
          "Folclore": 1,
          "Notívago": 4,
          "Construção": 0,
          "Investigação": 0
        },
        "Social": {
          "Sorte": 0,
          "Empatia": 3,
          "Expressão": 0,
          "Persuasão": 4,
          "Socializar": 2,
          "Subterfúgio": 2,
          "Intimidação": 0
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 1,
          "Limpeza": 1,
          "Atletismo": 1,
          "Culinária": 1,
          "Furtividade": 0,
          "Sobrevivência": 0
        }
      },
      "status": {
        "HP": {
          "v": 7,
          "max": 7
        },
        "Memory": {
          "v": 3,
          "max": 10
        },
        "Digisoul": {
          "v": 5,
          "max": 5
        },
        "Autoridade": 2,
        "Iniciativa": 5,
        "Deslocamento": 9
      },
      "surname": "Chouhou'in",
      "tagline": "Domain of Emotion.",
      "xpSpent": 0,
      "birthday": "13 de Novembro",
      "imageKey": "img-t-emi-1780153283432",
      "portrait": "rose",
      "digimonId": "d-betamon-line",
      "attributes": {
        "Vigor": 2,
        "Força": 2,
        "Destreza": 2,
        "Presença": 3,
        "Raciocínio": 3,
        "Autocontrole": 2,
        "Inteligência": 1,
        "Manipulação": 3,
        "Perseverança": 3
      },
      "tamerSkills": [
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Domain of Emotion",
          "effect": "Ativa o Domain de Emi e libera o uso das [Digital Gate Skills]. Enquanto estiver ativo, [Humanos] são imunes a ataques. Caso Shinra esteja próximo do Domain de Emi, ele poderá ativar [The Boy who took the Sword] mesmo que o Domain dele não esteja ativo.",
          "keyword": "Domain"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "Cupid Arrow",
          "effect": "Pode ser ativado durante qualquer momento do turno de um aliado. Emi escolhe uma Skill do aliado que custe 2+ de Memory e a coloca em [Cooldown: 2]; em troca, o aliado recebe Memory +1.",
          "target": "1 Aliado",
          "keyword": "Domain of Emotion"
        },
        {
          "type": "action",
          "custo": "-X Memory",
          "title": "Eye of Envy",
          "effect": "Emi copia uma Skill do tipo [Ação] do inimigo que ela já tenha informações e a usa, pagando o custo conforme descrito na Skill copiada.",
          "target": "1 Inimigo",
          "keyword": "Domain of Emotion"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "To the Most Beautiful",
          "effect": "Pelos próximos 3 Rounds, toda vez que o Digimon atacar um inimigo com mais Defesa que ele, recebe [Security Attack +1] e Defesa +1 (stack até 3x). Some quando a Skill desativar.",
          "target": "1 Digimon aliado",
          "keyword": "Domain of Emotion"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "dados": "Presença + Persuasão",
          "title": "Love at First Sight",
          "effect": "Aplica 1 carga de [Charm].",
          "target": "1 Inimigo (1ª vez vendo Emi)",
          "keyword": "Domain of Emotion"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "Aggravating Heart",
          "effect": "Escolhe uma Skill de Emi em [Cooldown] e aumenta +X dados nas rolagens de ataque do aliado (X = número do Cooldown atual). Quando o Cooldown acabar, o efeito é desativado. Só 1 aliado afetado por vez.",
          "target": "1 Aliado",
          "keyword": "Domain of Emotion"
        },
        {
          "type": "action",
          "custo": "-3 Memory",
          "title": "Emotion Memory Boost",
          "effect": "Não pode ser usado fora de combate. Custa 1 de Memory se houver inimigo com [Charm]. Entra em [Delay]; ao sair do [Delay], Memory +2 para Emi e os aliados escolhidos.",
          "target": "Emi + 2 aliados afetados por [Emi's Beloved] no Round anterior",
          "keyword": "Domain of Emotion"
        },
        {
          "type": "passive",
          "title": "Emi's Beloved",
          "effect": "No início do Round, escolha Filhos de Marte (masculino) ou Filhas de Vênus (feminino). Se o grupo escolhido for maior que o outro, Memory +1 para todos do grupo escolhido dentro do Domain. Se Emi fizer parte do grupo, Memory +1 extra para ela também.",
          "keyword": "Domain of Emotion"
        },
        {
          "type": "passive",
          "title": "Longing",
          "effect": "Quando Emi ou aliados causarem 15+ dano no Round, Emi pode reduzir o custo de 1 Skill em -1. Quando o HP de um inimigo for a 0, Emi pode reduzir o custo de 1 Skill para 0. Máximo de 2 Skills afetadas. Após usar, a Skill ganha [Cooldown: 3].",
          "keyword": "Domain of Emotion"
        }
      ]
    },
    {
      "id": "t-hibito",
      "xp": 80,
      "age": 14,
      "name": "HIBITO",
      "sign": "Câncer",
      "image": null,
      "voice": "Chiwa Saito",
      "height": 161,
      "skills": {
        "Mental": {
          "E.G.": 3,
          "P.S.": 0,
          "Ciência": 3,
          "Folclore": 0,
          "Notívago": 1,
          "Construção": 2,
          "Investigação": 2
        },
        "Social": {
          "Sorte": 3,
          "Empatia": 0,
          "Expressão": 0,
          "Persuasão": 0,
          "Socializar": 0,
          "Subterfúgio": 3,
          "Intimidação": 1
        },
        "Físico": {
          "Briga": 1,
          "Esquiva": 2,
          "Limpeza": 0,
          "Atletismo": 1,
          "Culinária": 0,
          "Furtividade": 2,
          "Sobrevivência": 4
        }
      },
      "status": {
        "HP": {
          "v": 7,
          "max": 7
        },
        "Memory": {
          "v": 3,
          "max": 10
        },
        "Digisoul": {
          "v": 3,
          "max": 3
        },
        "Autoridade": 2,
        "Iniciativa": 7,
        "Deslocamento": 11
      },
      "surname": "Akugetsu",
      "tagline": "Domain of Oblivion.",
      "xpSpent": 0,
      "birthday": "4 de Julho",
      "imageKey": "img-t-hibito-1780153283432",
      "portrait": "blue",
      "digimonId": "d-ghostmon-line",
      "attributes": {
        "Vigor": 2,
        "Força": 2,
        "Destreza": 4,
        "Presença": 2,
        "Raciocínio": 3,
        "Autocontrole": 2,
        "Inteligência": 4,
        "Manipulação": 2,
        "Perseverança": 1
      },
      "tamerSkills": [
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Domain of Oblivion",
          "effect": "Ativa o Domain de Hibito e libera o uso das [Digital Gate Skills]. Enquanto estiver ativo, [Humanos] são imunes a ataques.",
          "keyword": "Domain"
        },
        {
          "type": "action",
          "custo": "Nenhum",
          "title": "Jogress: Sky & Oblivion",
          "effect": "Requerimento: [Domain of Sky] + [Domain of Oblivion]. Tanto Hibito quanto Hare podem ativar essa Skill. Escolha uma Skill Passiva que recupere Memory de cada Domain. As Skills escolhidas são herdadas pelo [Domain of Time]. Em seguida, ative o [Domain of Time].",
          "keyword": "Jogress"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "dados": "Inteligência + Intimidação",
          "title": "Mark of Persecution",
          "effect": "Marca o inimigo. Pelos próximos 3 Rounds, toda vez que o inimigo marcado for atingido consecutivamente por aliados de Hibito, o próximo atacante recebe [Security Attack +X] (X = hits consecutivos, máx.3). Se a sequência for quebrada, a Skill é desativada.",
          "target": "1 Inimigo",
          "keyword": "Domain of Oblivion"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "Traumae",
          "effect": "Pode ser usado como reação a ataques Físicos. Reduz dano Físico recebido em -1 (humanos: -2). Caso o ataque seja fatal, o aliado pode rolar 2d10; com 1+ sucesso, sobrevive com 1 HP. Dura 2 Rounds em Hibito/Ghostmon, 1 Round nos demais.",
          "target": "Hibito ou 1 Aliado",
          "keyword": "Domain of Oblivion"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "dados": "Destreza + Subterfúgio",
          "title": "Memory Drain",
          "effect": "Rouba Memory de até 2 inimigos conforme o número de sucessos, máximo de 3 por inimigo.",
          "target": "1~2 Inimigos com 1+ de Memory",
          "keyword": "Domain of Oblivion"
        },
        {
          "type": "action",
          "custo": "-3 Memory",
          "title": "Rebellion",
          "effect": "Dá +2 sucessos em rolagens de ataque para todos os Digimons aliados. Ao final do Round, caso algum não tenha causado dano, reduz o HP dele em -25% do MAXHP. Dura 3 Rounds.",
          "target": "Todos os Digimons aliados",
          "keyword": "Domain of Oblivion"
        },
        {
          "type": "action",
          "custo": "-2 Memory",
          "title": "Build Up",
          "effect": "Aumenta o MAXHP do Digimon em +15% e cura essa quantidade. O Digimon ganha Iniciativa +1 (Ghostmon: +2). O HP dura 5 Rounds, a Iniciativa dura 3 e só funciona a partir do próximo Round.",
          "target": "1 Digimon Aliado",
          "keyword": "Domain of Oblivion"
        },
        {
          "type": "action",
          "custo": "-3 Memory",
          "title": "Oblivion Memory Boost",
          "effect": "Não pode ser usado fora de combate. Aplica 6 cargas de [Burn] a um personagem à escolha de Hibito, então entra em [Delay]; ao sair do [Delay], Memory +2 para Hibito e os aliados escolhidos.",
          "target": "Hibito + 2 Humanos Aliados",
          "keyword": "Domain of Oblivion"
        },
        {
          "type": "passive",
          "title": "An Eye for an Eye",
          "effect": "No início do Round, se um inimigo sofreu dano no Round anterior por meio de um ataque, Memory +1 para Hibito e todos os aliados dentro do Domain.",
          "keyword": "Domain of Oblivion"
        },
        {
          "type": "passive",
          "title": "A Tooth for a Tooth",
          "effect": "No início do Round, se um Digimon aliado sofreu dano no Round anterior por meio de um ataque, Memory +1 para Hibito e todos os aliados dentro do Domain.",
          "keyword": "Domain of Oblivion"
        },
        {
          "type": "action",
          "custo": "-1 Memory",
          "title": "Soul Ablaze",
          "effect": "Invoca 1 [Silhouette Token] adjacente ao aliado escolhido. Se o número de Silhouette Tokens em campo chegar a 3, Memory +1 para o aliado. Se o aliado for humano ou Digimon com \"Sistermon\" no nome, o Token ganha 1 carga de [Reboot].",
          "target": "1 Aliado",
          "keyword": "Domain of Time"
        },
        {
          "type": "action",
          "custo": "-3 Memory",
          "title": "Wheel of Time",
          "effect": "Todos os [Silhouette Tokens] fazem um ataque (Ação Livre, sem alvo válido necessário). Os ataques entram em [Delay]; ao resolver, o dano é dobrado e o alcance aumenta para 6 metros. Após os ataques, todos os Tokens são deletados.",
          "keyword": "Domain of Time"
        },
        {
          "type": "passive",
          "title": "Twilight Memories",
          "effect": "Durante o seu turno, Hibito pode invocar 1 [Silhouette Token] adjacente a ele como Ação Livre. Se o clima for [Intense Sunlight], pode criar 1 Token extra. Máximo de 3 Silhouette Tokens em campo.",
          "keyword": "Domain of Time"
        }
      ]
    },
    {
      "id": "t-karuma-mprr4jc7",
      "xp": 0,
      "age": 31,
      "name": "KARUMA",
      "sign": "????",
      "guest": true,
      "image": null,
      "voice": "??????????",
      "height": 182,
      "skills": {
        "Mental": {
          "E.G.": 0,
          "P.S.": 0,
          "Ciência": 0,
          "Folclore": 0,
          "Notívago": 0,
          "Construção": 0,
          "Investigação": 0
        },
        "Social": {
          "Sorte": 0,
          "Empatia": 0,
          "Expressão": 0,
          "Persuasão": 0,
          "Socializar": 0,
          "Subterfúgio": 0,
          "Intimidação": 0
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 0,
          "Limpeza": 0,
          "Atletismo": 0,
          "Culinária": 0,
          "Furtividade": 0,
          "Sobrevivência": 0
        }
      },
      "status": {
        "HP": {
          "v": 7,
          "max": 7
        },
        "Memory": {
          "v": 3,
          "max": 10
        },
        "Digisoul": {
          "v": 4,
          "max": 4
        },
        "Autoridade": 2,
        "Iniciativa": 5,
        "Deslocamento": 9
      },
      "surname": "Kagami",
      "tagline": "O Sacerdote do Templo Antigo",
      "xpSpent": 0,
      "birthday": "???",
      "imageKey": "t-karuma-mprr4jc7-1780124639711.webp",
      "portrait": "gold",
      "digimonId": "d-lianpumon-mprr4jc7",
      "inventory": [],
      "attributes": {
        "Vigor": 2,
        "Força": 2,
        "Destreza": 2,
        "Presença": 2,
        "Raciocínio": 2,
        "Autocontrole": 2,
        "Inteligência": 2,
        "Manipulação": 2,
        "Perseverança": 2
      },
      "tamerSkills": []
    }
  ],
  "sectors": [
    {
      "n": 1,
      "name": "Kuwaga",
      "bioma": "Bosque",
      "color": "sage"
    },
    {
      "n": 2,
      "name": "Sisters",
      "bioma": "Pradaria",
      "color": "wheat"
    },
    {
      "n": 3,
      "name": "—",
      "bioma": "Castelo",
      "color": "rose"
    },
    {
      "n": 4,
      "name": "Dark Area",
      "bioma": "—",
      "color": "indigo"
    },
    {
      "n": 5,
      "name": "Heaven",
      "bioma": "—",
      "color": "gold"
    }
  ],
  "bestiary": [
    {
      "id": "d-tinkermon-line",
      "line": "??? ↔ Tinkermon (Child) / Armor ↔ Witchmon ↔ ??? ↔ ???",
      "name": "Tinkermon Line",
      "image": null,
      "stages": [
        {
          "cost": "0",
          "size": 1,
          "type": "???",
          "image": null,
          "level": "In-Training (Lvl 2)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "pink",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 5,
            "Destreza": 5,
            "Presença": 4,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 3
          }
        },
        {
          "cost": "0",
          "size": 3,
          "type": "Fairy",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "0",
              "dados": "Força + Físico OU Enfraquecer",
              "title": "Speed Nightmare",
              "effect": "Aplica 2 [Poison]; em crítico aplica +2 cargas.",
              "alcance": "corpo a corpo 2m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Manipulação + Enfraquecer",
              "title": "Fairy Powder",
              "effect": "Aplica 1 [De-Digivolve] em inimigo lvl 4 ou inferior.",
              "alcance": "projétil 5m",
              "keyword": "Efeito"
            },
            {
              "type": "passive",
              "title": "Flying",
              "effect": "Durante o turno de Tinkermon, é possível gastar sua ação de movimento para ganhar 5 cargas de [Flight] e se mover. É possível retirar todas as cargas de [Flight] como uma Ação Livre durante o turno de Tinkermon.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 13,
            "Defesa": 2,
            "Armadura": 0,
            "Iniciativa": 8,
            "Deslocamento": 15
          },
          "affinity": {
            "Luz": 0,
            "Cura": 0,
            "Fogo": 0,
            "Gelo": 0,
            "Metal": 0,
            "Terra": 0,
            "Vento": 2,
            "Água": 1,
            "Trevas": 0,
            "Físico": 1,
            "Madeira": 0,
            "Trovão": 0,
            "Enfraquecer": 3,
            "Resistência": 1
          },
          "portrait": "pink",
          "weakness": {
            "Letal (+2)": "Vacina",
            "Agravado (+3)": "Trevas, Fogo",
            "Resistente (-2)": "Data"
          },
          "stageName": "Tinkermon",
          "attributes": {
            "Vigor": 3,
            "Força": 5,
            "Destreza": 5,
            "Presença": 4,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 3
          }
        },
        {
          "cost": "-2 Memory / duração 5 rounds",
          "size": 3,
          "type": "Demon Man",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Inteligência + Presença + Água",
              "title": "Aquary Pressure",
              "effect": "[Piercing].",
              "alcance": "projétil 8m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "0",
              "dados": "Inteligência + Presença + Vento",
              "title": "Baluluna Gale",
              "effect": "—",
              "alcance": "projétil 5m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "Flying Broom",
              "effect": "Witchmon começa a luta com cargas infinitas de [Flight]. Caso seja derrubada de alguma forma, ela pode voltar a voar como uma Ação Livre durante o turno dela; ela também pode parar de voar durante seu turno como uma ação livre se assim quiser. Witchmon pode carregar até dois acompanhantes em sua vassoura.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Magic School of WitcheIny",
              "effect": "Aumenta em +1 as afinidades de Água e Vento de Witchmon.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 18,
            "Defesa": 3,
            "Armadura": 0,
            "Iniciativa": 5,
            "Deslocamento": 11
          },
          "affinity": {
            "Luz": 0,
            "Cura": 0,
            "Fogo": 0,
            "Gelo": 0,
            "Metal": 0,
            "Terra": 0,
            "Vento": 4,
            "Água": 3,
            "Trevas": 0,
            "Físico": 1,
            "Madeira": 0,
            "Trovão": 0,
            "Enfraquecer": 3,
            "Resistência": 1
          },
          "portrait": "purple",
          "weakness": {
            "Letal (+2)": "Vacina",
            "Agravado (+3)": "Luz, Fogo",
            "Resistente (-2)": "Data, Vento, Água"
          },
          "stageName": "Witchmon",
          "attributes": {
            "Vigor": 3,
            "Força": 5,
            "Destreza": 5,
            "Presença": 4,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 3
          }
        },
        {
          "cost": "—",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Armor (Lvl 4)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "pink",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 5,
            "Destreza": 5,
            "Presença": 4,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 3
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Perfect (Lvl 5)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "pink",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 5,
            "Destreza": 5,
            "Presença": 4,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 3
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Ultimate (Lvl 6)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "pink",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 5,
            "Destreza": 5,
            "Presença": 4,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 3
          }
        }
      ],
      "sectors": [],
      "tamerId": "t-naoki",
      "imageKey": "img-d-tinkermon-line-1780153283432",
      "currentStage": 1
    },
    {
      "id": "d-kudamon-line",
      "line": "??? ↔ Kudamon (Child) / Armor ↔ Reppamon ↔ ??? ↔ ???",
      "name": "Kudamon Line",
      "image": null,
      "stages": [
        {
          "cost": "0",
          "size": 1,
          "type": "???",
          "image": null,
          "level": "In-Training (Lvl 2)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "teal",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 2,
            "Presença": 1,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 4,
            "Manipulação": 4,
            "Perseverança": 3
          }
        },
        {
          "cost": "0",
          "size": 3,
          "type": "Holy Beast",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Destreza ou Força + Físico",
              "title": "Dangan Senpu",
              "effect": "Nenhum.",
              "alcance": "corpo a corpo 1m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Manipulação + Enfraquecer",
              "title": "Zekkou Shou",
              "effect": "Aplica 1 carga de [Blind] no inimigo atingido. Só pode ser usado contra inimigo que não esteja afetado por Blind.",
              "alcance": "projétil 5m",
              "keyword": "Efeito"
            },
            {
              "type": "passive",
              "title": "Levitate",
              "effect": "Kudamon tem cargas infinitas de [Flight]. Caso seja derrubado de alguma forma, ele pode voltar a voar como uma Ação Livre durante o seu turno.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 14,
            "Defesa": 2,
            "Armadura": 0,
            "Iniciativa": 6,
            "Deslocamento": 8
          },
          "affinity": {
            "Luz": 0,
            "Cura": 0,
            "Fogo": 0,
            "Gelo": 0,
            "Metal": 0,
            "Terra": 0,
            "Vento": 1,
            "Água": 0,
            "Trevas": 0,
            "Físico": 1,
            "Madeira": 0,
            "Trovão": 0,
            "Enfraquecer": 3,
            "Resistência": 2
          },
          "portrait": "teal",
          "weakness": {
            "Letal (+2)": "Data",
            "Agravado (+3)": "Trevas, Metal",
            "Resistente (-2)": "Vírus"
          },
          "stageName": "Kudamon",
          "attributes": {
            "Vigor": 4,
            "Força": 1,
            "Destreza": 2,
            "Presença": 1,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 4,
            "Manipulação": 4,
            "Perseverança": 3
          }
        },
        {
          "cost": "-2 Memory / duração 5 rounds",
          "size": 3,
          "type": "Holy Beast",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Destreza + Inteligência + Vento",
              "title": "Shinku Kamaitachi",
              "effect": "[Jamming]. Ignora Defesa.",
              "alcance": "projétil 5m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Destreza + Vigor + Físico",
              "title": "Kurukuru Rekkuzan",
              "effect": "Nenhum.",
              "alcance": "corpo a corpo 2m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "Dance in the Forest",
              "effect": "Reppamon recebe Deslocamento +5 e Defesa +3 se o campo de batalha for uma floresta.",
              "keyword": "Passiva",
              "toggleBonus": {
                "statusBonus": {
                  "Defesa": 3,
                  "Deslocamento": 5
                }
              }
            }
          ],
          "status": {
            "HP": 19,
            "Defesa": 3,
            "Armadura": 0,
            "Iniciativa": 6,
            "Deslocamento": 8
          },
          "affinity": {
            "Luz": 0,
            "Cura": 0,
            "Fogo": 0,
            "Gelo": 0,
            "Metal": 0,
            "Terra": 0,
            "Vento": 2,
            "Água": 0,
            "Trevas": 0,
            "Físico": 2,
            "Madeira": 0,
            "Trovão": 0,
            "Enfraquecer": 3,
            "Resistência": 2
          },
          "portrait": "teal",
          "weakness": {
            "Letal (+2)": "Data",
            "Agravado (+3)": "Trevas, Metal",
            "Resistente (-2)": "Vírus, Vento, Luz"
          },
          "stageName": "Reppamon",
          "attributes": {
            "Vigor": 4,
            "Força": 1,
            "Destreza": 2,
            "Presença": 1,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 4,
            "Manipulação": 4,
            "Perseverança": 3
          }
        },
        {
          "cost": "—",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Armor (Lvl 4)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "teal",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 2,
            "Presença": 1,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 4,
            "Manipulação": 4,
            "Perseverança": 3
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Perfect (Lvl 5)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "teal",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 2,
            "Presença": 1,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 4,
            "Manipulação": 4,
            "Perseverança": 3
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Ultimate (Lvl 6)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "teal",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 2,
            "Presença": 1,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 4,
            "Manipulação": 4,
            "Perseverança": 3
          }
        }
      ],
      "sectors": [],
      "tamerId": "t-mori",
      "imageKey": "img-d-kudamon-line-1780153283432",
      "currentStage": 1
    },
    {
      "id": "d-blucomon-line",
      "line": "??? ↔ Blucomon (Child) / Armor ↔ Paledramon ↔ ??? ↔ ???",
      "name": "Blucomon Line",
      "image": null,
      "stages": [
        {
          "cost": "0",
          "size": 1,
          "type": "???",
          "image": null,
          "level": "In-Training (Lvl 2)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "blue",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 3,
            "Presença": 2,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 3
          }
        },
        {
          "cost": "0",
          "size": 3,
          "type": "Small Dragon",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Força + Físico",
              "title": "Ice Mash",
              "effect": "Nenhum.",
              "alcance": "corpo a corpo 1m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Vigor + Gelo",
              "title": "Baby Hail",
              "effect": "Reduz em -2 o Deslocamento do inimigo atingido por esse ataque. Reduz em -4 o Deslocamento em caso de Crítico. Essas alterações duram 3 Rounds.",
              "alcance": "projétil 5m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "Sturdy",
              "effect": "Blucomon recebe +5 de HP.",
              "keyword": "Passiva",
              "alwaysOn": {
                "inheritable": true,
                "statusBonus": {
                  "HP": 5
                }
              }
            }
          ],
          "status": {
            "HP": 17,
            "Defesa": 3,
            "Armadura": 0,
            "Iniciativa": 7,
            "Deslocamento": 10
          },
          "affinity": {
            "Luz": 0,
            "Cura": 0,
            "Fogo": 0,
            "Gelo": 4,
            "Metal": 0,
            "Terra": 0,
            "Vento": 0,
            "Água": 0,
            "Trevas": 0,
            "Físico": 1,
            "Madeira": 0,
            "Trovão": 0,
            "Enfraquecer": 0,
            "Resistência": 3
          },
          "portrait": "blue",
          "weakness": {
            "Letal (+2)": "Vírus",
            "Agravado (+3)": "Fogo, Metal",
            "Resistente (-2)": "Vacina"
          },
          "stageName": "Blucomon",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 3,
            "Presença": 2,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 3
          }
        },
        {
          "cost": "-2 Memory",
          "size": 3,
          "type": "Dragon",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Vigor + Destreza + Gelo",
              "title": "Ice Age",
              "effect": "[Blast 2]. Aplica 1 carga de [Bind] em todos os alvos atingidos. Alvo: todos os inimigos dentro da área de [Blast].",
              "alcance": "projétil 10m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Deslocamento + Físico",
              "title": "Meteor Hail",
              "effect": "Só pode ser usado caso Paledramon esteja sob a Condição de [Flight]. Após usar essa Skill, Deslocamento -3 para Paledramon, essa redução dura 3 Rounds, e pode stackar com ela própria.",
              "alcance": "corpo a corpo 1m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "Flying",
              "effect": "Durante o turno de Paledramon, é possível gastar sua ação de movimento para ganhar 5 cargas de [Flight] e se mover. É possível retirar todas as cargas de [Flight] como uma ação livre durante o turno de Paledramon.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Her Own Sun",
              "effect": "Imune a efeitos de clima que afetem Paledramon de forma negativa. Caso seja atingido por um ataque de Fogo de um Digimon de nível superior, essa passiva entrará em [Cooldown 3].",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 17,
            "Defesa": 4,
            "Armadura": 0,
            "Iniciativa": 7,
            "Deslocamento": 10
          },
          "affinity": {
            "Luz": 0,
            "Cura": 0,
            "Fogo": 0,
            "Gelo": 5,
            "Metal": 0,
            "Terra": 0,
            "Vento": 0,
            "Água": 0,
            "Trevas": 0,
            "Físico": 2,
            "Madeira": 0,
            "Trovão": 0,
            "Enfraquecer": 0,
            "Resistência": 3
          },
          "portrait": "blue",
          "weakness": {
            "Letal (+2)": "Vírus",
            "Agravado (+3)": "Fogo, Metal",
            "Resistente (-2)": "Vacina, Gelo, Água"
          },
          "stageName": "Paledramon",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 3,
            "Presença": 2,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 3
          }
        },
        {
          "cost": "—",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Armor (Lvl 4)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "blue",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 3,
            "Presença": 2,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 3
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Perfect (Lvl 5)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "blue",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 3,
            "Presença": 2,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 3
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Ultimate (Lvl 6)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "blue",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 3,
            "Presença": 2,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 3
          }
        }
      ],
      "sectors": [],
      "tamerId": "t-miki",
      "imageKey": "img-d-blucomon-line-1780153283432",
      "currentStage": 1
    },
    {
      "id": "d-wormmon-line",
      "line": "Leafmon ↔ Minomon ↔ Wormmon (Child) / Armor ↔ ??? ↔ ??? ↔ ???",
      "name": "Wormmon Line",
      "image": null,
      "stages": [
        {
          "cost": "0",
          "size": 1,
          "type": "Plant",
          "image": null,
          "level": "Fresh (Lvl 1)",
          "speed": 5,
          "locked": false,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "green",
          "weakness": {},
          "stageName": "Leafmon",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 3,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 4,
            "Manipulação": 1,
            "Perseverança": 2
          }
        },
        {
          "cost": "0",
          "size": 2,
          "type": "Larva",
          "image": null,
          "level": "In-Training (Lvl 2)",
          "speed": 5,
          "locked": false,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "green",
          "weakness": {},
          "stageName": "Minomon",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 3,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 4,
            "Manipulação": 1,
            "Perseverança": 2
          }
        },
        {
          "cost": "0",
          "size": 3,
          "type": "Larva",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Destreza + Enfraquecer",
              "title": "Nebaneba Net",
              "effect": "Aplica 1 carga de [Paralysis] no inimigo atingido. Em caso de Crítico, aplica 1 carga extra. Só pode ser usado contra inimigo que não esteja afetado por Paralysis.",
              "alcance": "projétil 5m",
              "keyword": "Efeito"
            },
            {
              "type": "action",
              "custo": "-1 Memory",
              "dados": "Destreza + Físico",
              "title": "Thread Clump Drop",
              "effect": "Só pode ser usado contra inimigo que esteja com cargas de [Flight]. Derruba o inimigo, tirando todas as cargas de [Flight] dele.",
              "alcance": "projétil 5m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Destreza + Físico",
              "title": "Silk Thread",
              "effect": "Nenhum.",
              "alcance": "projétil 5m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "To You, from Me",
              "effect": "Altera o efeito de [Averted Gaze].",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 12,
            "Defesa": 3,
            "Armadura": 0,
            "Iniciativa": 7,
            "Deslocamento": 9
          },
          "affinity": {
            "Luz": 0,
            "Cura": 0,
            "Fogo": 0,
            "Gelo": 0,
            "Metal": 0,
            "Terra": 0,
            "Vento": 0,
            "Água": 0,
            "Trevas": 0,
            "Físico": 1,
            "Madeira": 0,
            "Trovão": 0,
            "Enfraquecer": 3,
            "Resistência": 0
          },
          "portrait": "black",
          "weakness": {
            "Agravado (+3)": "Fogo, Físico, Enfraquecer, Trevas"
          },
          "stageName": "Wormmon",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 3,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 4,
            "Manipulação": 1,
            "Perseverança": 2
          }
        },
        {
          "cost": "-2 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "black",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 3,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 4,
            "Manipulação": 1,
            "Perseverança": 2
          }
        },
        {
          "cost": "—",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Armor (Lvl 4)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "black",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 3,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 4,
            "Manipulação": 1,
            "Perseverança": 2
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Perfect (Lvl 5)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "black",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 3,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 4,
            "Manipulação": 1,
            "Perseverança": 2
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Ultimate (Lvl 6)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "black",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 3,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 4,
            "Manipulação": 1,
            "Perseverança": 2
          }
        }
      ],
      "sectors": [],
      "tamerId": "t-yuri",
      "imageKey": "img-d-wormmon-line-1780153283432",
      "currentStage": 2
    },
    {
      "id": "d-solarmon-line",
      "line": "??? ↔ Solarmon (Child) / Armor ↔ Guardromon (Gold) ↔ ??? ↔ ???",
      "name": "Solarmon Line",
      "image": null,
      "stages": [
        {
          "cost": "0",
          "size": 1,
          "type": "???",
          "image": null,
          "level": "In-Training (Lvl 2)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "gold",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 2,
            "Destreza": 4,
            "Presença": 2,
            "Raciocínio": 4,
            "Autocontrole": 4,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 2
          }
        },
        {
          "cost": "0",
          "size": 3,
          "type": "Machine",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Destreza + Fogo",
              "title": "Shiny Ring",
              "effect": "Aplica 2 cargas de [Burn]. Em caso de Crítico, aplica +2 cargas extras.",
              "alcance": "projétil 5m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Força + Físico",
              "title": "Shiny Attack",
              "effect": "Nenhum.",
              "alcance": "corpo a corpo 1m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "Armored",
              "effect": "Armadura +1 para Solarmon.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Sturdy",
              "effect": "Solarmon recebe +5 de HP.",
              "keyword": "Passiva",
              "alwaysOn": {
                "inheritable": true,
                "statusBonus": {
                  "HP": 5
                }
              }
            }
          ],
          "status": {
            "HP": 18,
            "Defesa": 4,
            "Armadura": 1,
            "Iniciativa": 9,
            "Deslocamento": 11
          },
          "affinity": {
            "Luz": 0,
            "Cura": 0,
            "Fogo": 2,
            "Gelo": 0,
            "Metal": 0,
            "Terra": 0,
            "Vento": 0,
            "Água": 0,
            "Trevas": 0,
            "Físico": 1,
            "Madeira": 0,
            "Trovão": 0,
            "Enfraquecer": 0,
            "Resistência": 2
          },
          "portrait": "gold",
          "weakness": {
            "Letal (+2)": "Data",
            "Agravado (+3)": "Água, Terra",
            "Resistente (-2)": "Vírus"
          },
          "stageName": "Solarmon",
          "attributes": {
            "Vigor": 3,
            "Força": 2,
            "Destreza": 4,
            "Presença": 2,
            "Raciocínio": 4,
            "Autocontrole": 4,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 2
          }
        },
        {
          "cost": "-2 Memory / duração 5 rounds",
          "size": 3,
          "type": "Machine",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Destreza + Autocontrole + Fogo",
              "title": "Destruction Grenade",
              "effect": "Nenhum.",
              "alcance": "projétil 8m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "Chrondigizoit",
              "effect": "Diminui o Deslocamento e a Iniciativa de Guardromon em -3. Aumenta a Defesa em +1 e a Armadura em +2.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Defensive Program",
              "effect": "Guardromon não pode atacar inimigos que não tenham atacado ele no Round atual. No início do Round, ganha [Blocker].",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 18,
            "Defesa": 6,
            "Armadura": 2,
            "Iniciativa": 6,
            "Deslocamento": 8
          },
          "affinity": {
            "Luz": 0,
            "Cura": 0,
            "Fogo": 2,
            "Gelo": 0,
            "Metal": 0,
            "Terra": 0,
            "Vento": 0,
            "Água": 0,
            "Trevas": 0,
            "Físico": 1,
            "Madeira": 0,
            "Trovão": 0,
            "Enfraquecer": 0,
            "Resistência": 4
          },
          "portrait": "gold",
          "weakness": {
            "Agravado (+3)": "Água, Fogo, Enfraquecer",
            "Resistente (-2)": "Físico, Metal"
          },
          "stageName": "Guardromon (Gold)",
          "attributes": {
            "Vigor": 3,
            "Força": 2,
            "Destreza": 4,
            "Presença": 2,
            "Raciocínio": 4,
            "Autocontrole": 4,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 2
          }
        },
        {
          "cost": "—",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Armor (Lvl 4)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "gold",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 2,
            "Destreza": 4,
            "Presença": 2,
            "Raciocínio": 4,
            "Autocontrole": 4,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 2
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Perfect (Lvl 5)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "gold",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 2,
            "Destreza": 4,
            "Presença": 2,
            "Raciocínio": 4,
            "Autocontrole": 4,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 2
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Ultimate (Lvl 6)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "gold",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 2,
            "Destreza": 4,
            "Presença": 2,
            "Raciocínio": 4,
            "Autocontrole": 4,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 2
          }
        }
      ],
      "sectors": [],
      "tamerId": "t-eisuke",
      "imageKey": "img-d-solarmon-line-1780153283432",
      "currentStage": 1
    },
    {
      "id": "d-toyagumon-line",
      "line": "??? ↔ Toy Agumon (Child) / Yoyomon (Armor) ↔ Omekamon ↔ ??? ↔ ???",
      "name": "Toy Agumon Line",
      "image": null,
      "stages": [
        {
          "cost": "0",
          "size": 1,
          "type": "???",
          "image": null,
          "level": "In-Training (Lvl 2)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "orange",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 2,
            "Destreza": 2,
            "Presença": 5,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 1,
            "Manipulação": 1,
            "Perseverança": 3
          }
        },
        {
          "cost": "0",
          "size": 3,
          "type": "Puppet",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Destreza + Fogo",
              "title": "Toy Flame",
              "effect": "Nenhum.",
              "alcance": "projétil 8m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Perseverança + Luz",
              "title": "Fancy Star",
              "effect": "Nenhum.",
              "alcance": "projétil 5m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Força + Físico",
              "title": "Block Punch",
              "effect": "Nenhum.",
              "alcance": "corpo a corpo 1m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "Sturdy",
              "effect": "ToyAgumon recebe +5 de HP.",
              "keyword": "Passiva",
              "alwaysOn": {
                "inheritable": true,
                "statusBonus": {
                  "HP": 5
                }
              }
            }
          ],
          "status": {
            "HP": 18,
            "Defesa": 2,
            "Armadura": 0,
            "Iniciativa": 5,
            "Deslocamento": 9
          },
          "affinity": {
            "Luz": 1,
            "Fogo": 1,
            "Físico": 1,
            "Enfraquecer": 5,
            "Resistência": 2
          },
          "portrait": "orange",
          "weakness": {
            "Letal (+2)": "Vírus",
            "Agravado (+3)": "Água, Enfraquecer",
            "Resistente (-2)": "Vacina"
          },
          "stageName": "Toy Agumon",
          "attributes": {
            "Vigor": 3,
            "Força": 2,
            "Destreza": 2,
            "Presença": 5,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 1,
            "Manipulação": 1,
            "Perseverança": 3
          }
        },
        {
          "cost": "-2 Memory",
          "size": 3,
          "type": "Puppet",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-3 Memory",
              "dados": "Presença + Enfraquecer",
              "title": "Poe's Law",
              "effect": "Até o final do Round, Omekamon é tratado como [Omegamon / Vacina / Ultimate (Lvl.6) / Holy Knight]. Inimigos Lvl 3 ou menos perdem seus turnos; Lvl 4 podem resistir (rolagem). Lvl 5+ são imunes.",
              "keyword": "Efeito"
            },
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Força + Físico + 3d10",
              "title": "Omeka Kick",
              "effect": "Nenhum.",
              "alcance": "corpo a corpo 1m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Destreza + Enfraquecer + 2d10",
              "title": "RKGK Rocket",
              "effect": "Aplica 1 carga de [Rage] no inimigo atingido.",
              "alcance": "projétil 5m",
              "keyword": "Ataque"
            }
          ],
          "status": {
            "HP": 23,
            "Defesa": 3,
            "Armadura": 0,
            "Iniciativa": 5,
            "Deslocamento": 9
          },
          "affinity": {
            "Luz": 1,
            "Fogo": 1,
            "Físico": 2,
            "Enfraquecer": 6,
            "Resistência": 2
          },
          "portrait": "orange",
          "weakness": {
            "Letal (+2)": "Vírus",
            "Agravado (+3)": "Enfraquecer, Físico",
            "Resistente (-2)": "Vacina, Fogo, Luz"
          },
          "stageName": "Omekamon",
          "attributes": {
            "Vigor": 3,
            "Força": 2,
            "Destreza": 2,
            "Presença": 5,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 1,
            "Manipulação": 1,
            "Perseverança": 3
          }
        },
        {
          "cost": "[Weather Digimental] / Duração: efeito \"Day\" atual",
          "size": 3,
          "type": "Puppet",
          "image": null,
          "level": "Armor (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-1 Digimental",
              "dados": "[Poder] + Físico",
              "title": "Torpedo Crossing",
              "effect": "Após o ataque, mesmo que erre, Yoyomon pode se reposicionar de acordo com o alcance da Skill.",
              "alcance": "corpo a corpo 3m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-2 Digimental",
              "dados": "[Poder] + Físico + 3d10",
              "title": "One-Hand Swing",
              "effect": "Consegue atingir alvos sob [Flight].",
              "alcance": "corpo a corpo 2m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "Armor Evolution",
              "effect": "Yoyomon ganha uma nova barra [Digimental]. No início de cada turno, perde 1 de Digimental.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Climate Armor: Sunny Day",
              "effect": "O primeiro efeito de [Intense Sunlight] afeta todas as ações de Yoyomon, independente das condições. Yoyomon é imune a efeitos negativos de climas comuns.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Sharp Look",
              "effect": "Assim que Yoyomon entrar na batalha, Hare pode imediatamente usar [Goggle Girl] como ação livre sem pagar o custo.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 21,
            "Defesa": 3,
            "Armadura": 0,
            "Iniciativa": 5,
            "Deslocamento": 9
          },
          "affinity": {
            "Luz": 1,
            "Fogo": 1,
            "Físico": 3,
            "Enfraquecer": 5,
            "Resistência": 2
          },
          "portrait": "orange",
          "weakness": {
            "Agravado (+3)": "Trevas, Água, Gelo"
          },
          "stageName": "Yoyomon",
          "attributes": {
            "Vigor": 3,
            "Força": 2,
            "Destreza": 2,
            "Presença": 5,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 1,
            "Manipulação": 1,
            "Perseverança": 3
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Perfect (Lvl 5)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "orange",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 2,
            "Destreza": 2,
            "Presença": 5,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 1,
            "Manipulação": 1,
            "Perseverança": 3
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Ultimate (Lvl 6)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "orange",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 2,
            "Destreza": 2,
            "Presença": 5,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 1,
            "Manipulação": 1,
            "Perseverança": 3
          }
        }
      ],
      "sectors": [],
      "tamerId": "t-hare",
      "imageKey": "img-d-toyagumon-line-1780153283432",
      "currentStage": 1
    },
    {
      "id": "d-penmon-line",
      "line": "??? ↔ Penmon ↔ Swanmon ↔ ??? ↔ ???",
      "name": "Penmon Line",
      "image": null,
      "stages": [
        {
          "cost": "0",
          "size": 1,
          "type": "???",
          "image": null,
          "level": "In-Training (Lvl 2)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "wheat",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 1,
            "Destreza": 4,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 1,
            "Inteligência": 3,
            "Manipulação": 2,
            "Perseverança": 2
          }
        },
        {
          "cost": "0",
          "size": 3,
          "type": "Bird",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-1 Memory",
              "dados": "Deslocamento",
              "title": "Slide Attack",
              "effect": "Se a afinidade Físico de Penmon for menor que 3, reduz -3 dados da rolagem.",
              "alcance": "corpo a corpo 3m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Inteligência + Gelo",
              "title": "Ice Prism",
              "effect": "Nenhum.",
              "alcance": "projétil 5m",
              "keyword": "Ataque"
            }
          ],
          "status": {
            "HP": 13,
            "Defesa": 3,
            "Armadura": 0,
            "Iniciativa": 6,
            "Deslocamento": 10
          },
          "affinity": {
            "Gelo": 3,
            "Físico": 3,
            "Resistência": 3
          },
          "portrait": "wheat",
          "weakness": {
            "Letal (+2)": "Data",
            "Agravado (+3)": "Fogo, Madeira",
            "Resistente (-2)": "Vírus"
          },
          "stageName": "Penmon",
          "attributes": {
            "Vigor": 3,
            "Força": 1,
            "Destreza": 4,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 1,
            "Inteligência": 3,
            "Manipulação": 2,
            "Perseverança": 2
          }
        },
        {
          "cost": "-2 Memory",
          "size": 3,
          "type": "Bird",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Destreza + Gelo + Vento",
              "title": "Down Tornado",
              "effect": "Nenhum.",
              "alcance": "projétil 8m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-2 Memory",
              "title": "White Marie",
              "effect": "Cooldown: 5 Turnos. Kanade ganha 3 cargas de [Flight]; enquanto tiver essas cargas, toda vez que curar HP de um aliado, as penas de suas asas atacam 1 inimigo no alcance do Deslocamento; dano = metade da cura. Dura 3 Rounds.",
              "target": "Kanade",
              "keyword": "Efeito"
            },
            {
              "type": "passive",
              "title": "White Wings",
              "effect": "Swanmon tem cargas infinitas de [Flight]. Caso seja derrubada, pode voltar a voar como Ação Livre. Swanmon pode carregar 1 acompanhante em suas costas.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 18,
            "Defesa": 4,
            "Armadura": 0,
            "Iniciativa": 6,
            "Deslocamento": 10
          },
          "affinity": {
            "Gelo": 4,
            "Vento": 1,
            "Físico": 3,
            "Resistência": 3
          },
          "portrait": "wheat",
          "weakness": {
            "Letal (+2)": "Data",
            "Agravado (+3)": "Fogo, Terra",
            "Resistente (-2)": "Vírus, Gelo, Vento"
          },
          "stageName": "Swanmon",
          "attributes": {
            "Vigor": 3,
            "Força": 1,
            "Destreza": 4,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 1,
            "Inteligência": 3,
            "Manipulação": 2,
            "Perseverança": 2
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Perfect (Lvl 5)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "wheat",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 1,
            "Destreza": 4,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 1,
            "Inteligência": 3,
            "Manipulação": 2,
            "Perseverança": 2
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Ultimate (Lvl 6)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "wheat",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 1,
            "Destreza": 4,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 1,
            "Inteligência": 3,
            "Manipulação": 2,
            "Perseverança": 2
          }
        }
      ],
      "sectors": [],
      "tamerId": "t-kanade",
      "imageKey": "img-d-penmon-line-1780153283432",
      "currentStage": 1
    },
    {
      "id": "d-floramon-line",
      "line": "??? ↔ Floramon ↔ Coatlmon ↔ ??? ↔ ???",
      "name": "Floramon Line",
      "image": null,
      "stages": [
        {
          "cost": "0",
          "size": 1,
          "type": "???",
          "image": null,
          "level": "In-Training (Lvl 2)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "green",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 3,
            "Destreza": 2,
            "Presença": 3,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 1,
            "Perseverança": 3
          }
        },
        {
          "cost": "0",
          "size": 3,
          "type": "Plant",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Força + Enfraquecer",
              "title": "Poison Ivy",
              "effect": "Aplica 8 cargas de [Poison] no inimigo atingido.",
              "alcance": "corpo a corpo 3m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-3 Memory",
              "dados": "Presença + Enfraquecer",
              "title": "Sweet Scent",
              "effect": "Cooldown: 3 Turnos. [Blast 1]. Aplica 1 carga de [Charm] em todos os inimigos atingidos.",
              "alcance": "projétil 10m",
              "keyword": "Efeito"
            }
          ],
          "status": {
            "HP": 13,
            "Defesa": 2,
            "Armadura": 0,
            "Iniciativa": 5,
            "Deslocamento": 10
          },
          "affinity": {
            "Enfraquecer": 5,
            "Resistência": 1
          },
          "portrait": "green",
          "weakness": {
            "Letal (+2)": "Vírus",
            "Agravado (+3)": "Fogo, Vento",
            "Resistente (-2)": "Vacina"
          },
          "stageName": "Floramon",
          "attributes": {
            "Vigor": 3,
            "Força": 3,
            "Destreza": 2,
            "Presença": 3,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 1,
            "Perseverança": 3
          }
        },
        {
          "cost": "-2 Memory",
          "size": 3,
          "type": "Mythical Beast",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Força + Vento + 3d10",
              "title": "Toltecan Wind",
              "effect": "[Blast 2]. Inimigos atingidos são forçados a mover 3 quadrados para trás.",
              "alcance": "projétil 10m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Força + Terra + 3d10",
              "title": "Fossil Wave",
              "effect": "Custa 0 caso o alvo tenha [Bind]. Aplica 1 carga de [Bind] no inimigo se não tiver; se já tiver, o ataque ganha +3d10.",
              "alcance": "projétil 8m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "In the Garden where Love Blooms",
              "effect": "Coatlmon é imune a [Charm]. Quando um inimigo aplicar [Charm] em 1 aliado, Coatlmon pode gastar sua ação do turno para negar o efeito (1x por Round).",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "White-Winged Snake",
              "effect": "Coatlmon tem cargas infinitas de [Flight]. Caso seja derrubada, pode voltar a voar como Ação Livre.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 18,
            "Defesa": 3,
            "Armadura": 0,
            "Iniciativa": 5,
            "Deslocamento": 10
          },
          "affinity": {
            "Terra": 1,
            "Vento": 1,
            "Enfraquecer": 5,
            "Resistência": 1
          },
          "portrait": "green",
          "weakness": {
            "Imune": "Charm",
            "Letal (+2)": "Vírus",
            "Agravado (+3)": "Trevas, Trovão",
            "Resistente (-2)": "Vacina, Vento, Terra"
          },
          "stageName": "Coatlmon",
          "attributes": {
            "Vigor": 3,
            "Força": 3,
            "Destreza": 2,
            "Presença": 3,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 1,
            "Perseverança": 3
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Perfect (Lvl 5)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "green",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 3,
            "Destreza": 2,
            "Presença": 3,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 1,
            "Perseverança": 3
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Ultimate (Lvl 6)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "green",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 3,
            "Força": 3,
            "Destreza": 2,
            "Presença": 3,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 1,
            "Perseverança": 3
          }
        }
      ],
      "sectors": [],
      "tamerId": "t-shinra",
      "imageKey": "img-d-floramon-line-1780153283432",
      "currentStage": 1
    },
    {
      "id": "d-hyokomon-line",
      "line": "??? ↔ Hyokomon ↔ ??? ↔ ??? ↔ ???",
      "name": "Hyokomon Line",
      "image": null,
      "stages": [
        {
          "cost": "0",
          "size": 1,
          "type": "???",
          "image": null,
          "level": "In-Training (Lvl 2)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "indigo",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 4,
            "Presença": 1,
            "Raciocínio": 3,
            "Autocontrole": 4,
            "Inteligência": 2,
            "Manipulação": 4,
            "Perseverança": 2
          }
        },
        {
          "cost": "0",
          "size": 3,
          "type": "Chick",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "reaction",
              "custo": "-1 Memory",
              "dados": "Destreza + Físico",
              "title": "Karatakewari",
              "effect": "Quando Hyokomon for alvo de ataque corpo a corpo, pode ativar essa Skill. Se os sucessos dessa Skill forem maiores que a rolagem de ataque do inimigo, cancela o ataque.",
              "alcance": "corpo a corpo 1m",
              "keyword": "Reação"
            },
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Destreza + Físico",
              "title": "Hiken: Piyopiyo Giri",
              "effect": "Nenhum.",
              "alcance": "corpo a corpo 1m",
              "keyword": "Ataque"
            }
          ],
          "status": {
            "HP": 12,
            "Defesa": 3,
            "Armadura": 0,
            "Iniciativa": 9,
            "Deslocamento": 10
          },
          "affinity": {
            "Físico": 4
          },
          "portrait": "indigo",
          "weakness": {
            "Letal (+2)": "Data",
            "Agravado (+3)": "Enfraquecer, Trevas",
            "Resistente (-2)": "Vírus"
          },
          "stageName": "Hyokomon",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 4,
            "Presença": 1,
            "Raciocínio": 3,
            "Autocontrole": 4,
            "Inteligência": 2,
            "Manipulação": 4,
            "Perseverança": 2
          }
        },
        {
          "cost": "-2 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "indigo",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 4,
            "Presença": 1,
            "Raciocínio": 3,
            "Autocontrole": 4,
            "Inteligência": 2,
            "Manipulação": 4,
            "Perseverança": 2
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Perfect (Lvl 5)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "indigo",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 4,
            "Presença": 1,
            "Raciocínio": 3,
            "Autocontrole": 4,
            "Inteligência": 2,
            "Manipulação": 4,
            "Perseverança": 2
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Ultimate (Lvl 6)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "indigo",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 4,
            "Presença": 1,
            "Raciocínio": 3,
            "Autocontrole": 4,
            "Inteligência": 2,
            "Manipulação": 4,
            "Perseverança": 2
          }
        }
      ],
      "sectors": [],
      "tamerId": "t-kumo",
      "imageKey": "img-d-hyokomon-line-1780153283432",
      "currentStage": 1
    },
    {
      "id": "d-ghostmon-line",
      "line": "??? ↔ Ghostmon ↔ Fla Wizarmon ↔ ??? ↔ ???",
      "name": "Ghostmon Line",
      "image": null,
      "stages": [
        {
          "cost": "0",
          "size": 1,
          "type": "???",
          "image": null,
          "level": "In-Training (Lvl 2)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "blue",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 4,
            "Presença": 2,
            "Raciocínio": 3,
            "Autocontrole": 2,
            "Inteligência": 4,
            "Manipulação": 2,
            "Perseverança": 1
          }
        },
        {
          "cost": "0",
          "size": 3,
          "type": "Ghost",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Inteligência + Luz",
              "title": "Little Plasma",
              "effect": "Nenhum.",
              "alcance": "projétil 5m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Força + Trevas",
              "title": "Jack Raid",
              "effect": "Entra em [Delay] ao ser usado. Enquanto com essa Skill em [Delay], Ghostmon tem 1 carga de [Phantasm].",
              "alcance": "corpo a corpo 1m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "Levitate",
              "effect": "Ghostmon tem cargas infinitas de [Flight]. Caso seja derrubado, pode voltar a voar como Ação Livre.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Will-o'-the-Wisp",
              "effect": "Altera o efeito de [Burn] para que recupere o HP do alvo ao invés de reduzir.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 12,
            "Defesa": 3,
            "Armadura": 0,
            "Iniciativa": 7,
            "Deslocamento": 11
          },
          "affinity": {
            "Luz": 2,
            "Trevas": 1,
            "Resistência": 1
          },
          "portrait": "blue",
          "weakness": {
            "Letal (+2)": "Vacina",
            "Agravado (+3)": "Água, Gelo",
            "Resistente (-2)": "Data"
          },
          "stageName": "Ghostmon",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 4,
            "Presença": 2,
            "Raciocínio": 3,
            "Autocontrole": 2,
            "Inteligência": 4,
            "Manipulação": 2,
            "Perseverança": 1
          }
        },
        {
          "cost": "-2 Memory",
          "size": 3,
          "type": "Demon Man",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Inteligência + Fogo + 2d10",
              "title": "Magic Ignition",
              "effect": "Se esse ataque errar, causa 2 de dano no alvo.",
              "alcance": "projétil 5m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-2 Memory",
              "title": "Fire Cloud",
              "effect": "Pode ser colocado em [Delay] ao ativar. Muda o clima para [Intense Sunlight] durante 3 Rounds. Se o clima já for [Intense Sunlight], muda para: Projétil 10m, [Blast 1], aplica 2 + X cargas de [Burn] em todos na área (X = sucessos em Raciocínio + Fogo).",
              "keyword": "Efeito"
            },
            {
              "type": "passive",
              "title": "Fire Sorcery",
              "effect": "Quando cargas de [Burn] forem ser aplicadas em Fla Wizarmon, pode redirecionar para um de seus dois fósforos (se o fósforo não tiver cargas). Cargas nos fósforos não contam para o relógio. Ao usar ataque com [Fogo] ou [Intense Sunlight] no texto, pode gastar todas as cargas de um fósforo para reduzir o custo em -1 ou aumentar a rolagem em +2 dados.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 17,
            "Defesa": 4,
            "Armadura": 0,
            "Iniciativa": 7,
            "Deslocamento": 11
          },
          "affinity": {
            "Luz": 2,
            "Fogo": 2,
            "Trevas": 1,
            "Resistência": 1
          },
          "portrait": "blue",
          "weakness": {
            "Letal (+2)": "Vacina",
            "Agravado (+3)": "Água, Terra",
            "Resistente (-2)": "Data, Fogo, Trevas"
          },
          "stageName": "Fla Wizarmon",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 4,
            "Presença": 2,
            "Raciocínio": 3,
            "Autocontrole": 2,
            "Inteligência": 4,
            "Manipulação": 2,
            "Perseverança": 1
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Perfect (Lvl 5)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "blue",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 4,
            "Presença": 2,
            "Raciocínio": 3,
            "Autocontrole": 2,
            "Inteligência": 4,
            "Manipulação": 2,
            "Perseverança": 1
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Ultimate (Lvl 6)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "blue",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 4,
            "Presença": 2,
            "Raciocínio": 3,
            "Autocontrole": 2,
            "Inteligência": 4,
            "Manipulação": 2,
            "Perseverança": 1
          }
        }
      ],
      "sectors": [],
      "tamerId": "t-hibito",
      "imageKey": "img-d-ghostmon-line-1780153283432",
      "currentStage": 1
    },
    {
      "id": "d-betamon-line",
      "line": "??? ↔ Betamon ↔ Coelamon ↔ ??? ↔ ???",
      "name": "Betamon Line",
      "image": null,
      "stages": [
        {
          "cost": "0",
          "size": 1,
          "type": "???",
          "image": null,
          "level": "In-Training (Lvl 2)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "rose",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 2,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 2,
            "Inteligência": 1,
            "Manipulação": 3,
            "Perseverança": 3
          }
        },
        {
          "cost": "0",
          "size": 3,
          "type": "Amphibian",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Força + Trovão",
              "title": "Dengeki Biririn",
              "effect": "Aplica 1 carga de [Paralysis] no inimigo atingido.",
              "alcance": "corpo a corpo 1m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Força + Físico",
              "title": "Cutter Fin",
              "effect": "[Jamming]. Pode escolher alvos sob [Flight]. Se o alvo estiver sob [Flight], o ataque recebe +2d10.",
              "alcance": "corpo a corpo 2m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "Amphibian",
              "effect": "Betamon ganha +1 de afinidade com Água. Na água: Defesa +1, Deslocamento +5, ignora obstáculos.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 12,
            "Defesa": 2,
            "Armadura": 0,
            "Iniciativa": 5,
            "Deslocamento": 9
          },
          "affinity": {
            "Água": 1,
            "Físico": 5,
            "Trovão": 2,
            "Resistência": 2
          },
          "portrait": "rose",
          "weakness": {
            "Letal (+2)": "Vacina",
            "Agravado (+3)": "Terra, Madeira",
            "Resistente (-2)": "Data"
          },
          "stageName": "Betamon",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 2,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 2,
            "Inteligência": 1,
            "Manipulação": 3,
            "Perseverança": 3
          }
        },
        {
          "cost": "-2 Memory",
          "size": 3,
          "type": "Ancient Fish",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Força + Água + 3d10",
              "title": "Destructive Spear",
              "effect": "Se atingir um inimigo de nível inferior ao de Coelamon, Memory +1.",
              "alcance": "projétil 8m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-1 Memory",
              "dados": "Força + Físico + 2d10",
              "title": "Variable Darts",
              "effect": "Pode usar ação livre para colocar em [Cooldown: 2]; se fizer isso, Coelamon ganha [Blocker]. Consegue atingir inimigos sob [Flight].",
              "alcance": "corpo a corpo 3m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "From the Net Ocean",
              "effect": "Coelamon tem +2 de afinidade à Água. Na água: Defesa +3, Deslocamento +5, ignora obstáculos. Ao sair da água no seu turno, faz ação de movimento imediata; se ficar adjacente a um inimigo, ganha 1 carga de [Unsuspend].",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 17,
            "Defesa": 3,
            "Armadura": 0,
            "Iniciativa": 5,
            "Deslocamento": 9
          },
          "affinity": {
            "Água": 3,
            "Físico": 6,
            "Trovão": 2,
            "Resistência": 2
          },
          "portrait": "rose",
          "weakness": {
            "Letal (+2)": "Vacina",
            "Agravado (+3)": "Trovão, Madeira",
            "Resistente (-2)": "Data, Água, Físico"
          },
          "stageName": "Coelamon",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 2,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 2,
            "Inteligência": 1,
            "Manipulação": 3,
            "Perseverança": 3
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Perfect (Lvl 5)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "rose",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 2,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 2,
            "Inteligência": 1,
            "Manipulação": 3,
            "Perseverança": 3
          }
        },
        {
          "cost": "-3 Memory",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Ultimate (Lvl 6)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "rose",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 2,
            "Presença": 3,
            "Raciocínio": 3,
            "Autocontrole": 2,
            "Inteligência": 1,
            "Manipulação": 3,
            "Perseverança": 3
          }
        }
      ],
      "sectors": [],
      "tamerId": "t-emi",
      "imageKey": "img-d-betamon-line-1780153283432",
      "currentStage": 1
    },
    {
      "id": "d-greymon",
      "line": "Greymon",
      "lore": "Koromon ↔ ??? ↔ Greymon ↔ ??? ↔ ???",
      "name": "Greymon",
      "image": null,
      "stages": [
        {
          "cost": "—",
          "size": 3,
          "type": "Dinosaur",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Vigor + Fogo + 2d10",
              "title": "Mega Flame",
              "effect": "Aplica 4 cargas de [Burn] no inimigo atingido.",
              "alcance": "projétil 8m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Força + Físico + 3d10",
              "title": "Blaster Tail",
              "effect": "[Blast 1].",
              "alcance": "corpo a corpo 2m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Força + Físico",
              "title": "Horn Strike",
              "effect": "Nenhum.",
              "alcance": "corpo a corpo 1m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "Digital Body +",
              "effect": "Caso seja atacado por um humano ou um Digimon de nível inferior, duplica sua Defesa atual até o final do Round.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Survive +",
              "effect": "No início do seu turno, HP -2 e Memory +2.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Abnormal Fighting Spirit",
              "effect": "+1 sucesso em ataques. Ao causar dano em um inimigo durante o seu turno com um ataque, ganha 1 carga de [Unsuspend]. Esse segundo efeito só pode ser ativado uma vez por Round.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 30,
            "Defesa": 3,
            "Armadura": 1,
            "Iniciativa": 5,
            "Deslocamento": 16
          },
          "affinity": {
            "Fogo": 3,
            "Físico": 2
          },
          "portrait": "orange",
          "weakness": {
            "Letal (+2)": "Vacina",
            "Agravado (+3)": "Água, Gelo",
            "Resistente (-2)": "Data, Fogo"
          },
          "stageName": "Greymon",
          "attributes": {
            "Vigor": 6,
            "Força": 6,
            "Destreza": 4,
            "Presença": 6,
            "Raciocínio": 2,
            "Autocontrole": 1,
            "Inteligência": 2,
            "Manipulação": 1,
            "Perseverança": 6
          }
        }
      ],
      "sectors": [
        2
      ],
      "tamerId": null,
      "imageKey": "img-d-greymon-1780153283432",
      "currentStage": 0
    },
    {
      "id": "d-pico-devimon",
      "line": "Pico Devimon",
      "lore": "??? ↔ Pico Devimon ↔ ??? ↔ ??? ↔ ???",
      "name": "Pico Devimon",
      "image": null,
      "stages": [
        {
          "cost": "—",
          "size": 3,
          "type": "Small Devil",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-1 Memory",
              "dados": "Destreza + Trevas",
              "title": "Pico Darts",
              "effect": "Recupera o HP de Pico Devimon de acordo com a quantidade de dano causado.",
              "alcance": "projétil 5m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Manipulação + Trevas",
              "title": "Devil's Whisper",
              "effect": "Aplica 1 carga de [Charm] no inimigo escolhido. Se o inimigo escolhido for um Digimon do tipo [Angel] de Nível 4 ou menos, esse efeito é um sucesso automático.",
              "alcance": "projétil 8m",
              "keyword": "Efeito"
            },
            {
              "type": "passive",
              "title": "Digital Body",
              "effect": "Caso seja atacado por um humano, duplica sua Defesa atual até o final do Round.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Survive",
              "effect": "No início do seu turno, HP -1 e Memory +1.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 9,
            "Defesa": 3,
            "Armadura": 0,
            "Iniciativa": 5,
            "Deslocamento": 8
          },
          "affinity": {
            "Trevas": 3
          },
          "portrait": "purple",
          "weakness": {
            "Letal (+2)": "Vacina",
            "Agravado (+3)": "Luz, Fogo",
            "Resistente (-2)": "Data, Trevas"
          },
          "stageName": "Pico Devimon",
          "attributes": {
            "Vigor": 1,
            "Força": 1,
            "Destreza": 3,
            "Presença": 1,
            "Raciocínio": 3,
            "Autocontrole": 1,
            "Inteligência": 3,
            "Manipulação": 4,
            "Perseverança": 1
          }
        }
      ],
      "sectors": [
        2
      ],
      "tamerId": null,
      "imageKey": "img-d-pico-devimon-1780153283432",
      "currentStage": 0
    },
    {
      "id": "d-sistermon-blanc",
      "line": "Sistermon Blanc",
      "lore": "??? ↔ Sistermon Blanc ↔ ??? ↔ ??? ↔ ???",
      "name": "Sistermon Blanc",
      "image": null,
      "stages": [
        {
          "cost": "—",
          "size": 3,
          "type": "Puppet",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "Nenhum [corpo a corpo] ou -1 Memory [projétil]",
              "dados": "Força + Físico [corpo a corpo] ou Inteligência + Luz [projétil]",
              "title": "Divine Pierce",
              "effect": "Nenhum.",
              "alcance": "corpo a corpo 1m ou projétil 8m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-X Memory",
              "title": "Protect Wave",
              "effect": "X é igual à quantidade de Memory usada [mín.1, máx.4]. Cancela o próximo ataque ou efeito que atingiria os X aliados escolhidos.",
              "alcance": "—",
              "keyword": "Efeito"
            },
            {
              "type": "passive",
              "title": "Digital Body",
              "effect": "Caso seja atacado por um humano, duplica sua Defesa atual até o final do Round.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Selfless Survive",
              "effect": "No início do turno de Sistermon Blanc, ela perde 1 HP. Em seguida, concede Memory +1 para si mesma ou para 1 aliado à sua escolha. Caso o alvo não seja Sistermon Blanc, o custo em HP é aumentado em +2.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "You're my Hero",
              "effect": "Enquanto houver ao menos um Digimon aliado do tipo [Small Dragon] e de atributo [Data] em batalha, no início de cada Round todas as [Sistermons] recebem [Blocker].",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 8,
            "Defesa": 1,
            "Armadura": 0,
            "Iniciativa": 3,
            "Deslocamento": 7
          },
          "affinity": {
            "Luz": 2,
            "Cura": 1
          },
          "portrait": "gold",
          "weakness": {
            "Letal (+2)": "Data",
            "Agravado (+3)": "Trevas, Fogo",
            "Resistente (-2)": "Vírus, Luz"
          },
          "stageName": "Sistermon Blanc",
          "attributes": {
            "Vigor": 2,
            "Força": 1,
            "Destreza": 2,
            "Presença": 1,
            "Raciocínio": 1,
            "Autocontrole": 1,
            "Inteligência": 2,
            "Manipulação": 0,
            "Perseverança": 4
          }
        }
      ],
      "sectors": [
        2
      ],
      "tamerId": null,
      "imageKey": "img-d-sistermon-blanc-1780153283432",
      "currentStage": 0
    },
    {
      "id": "d-sistermon-noir",
      "line": "Sistermon Noir",
      "lore": "??? ↔ ??? ↔ Sistermon Ciel / Sistermon Noir ↔ ??? ↔ ???",
      "name": "Sistermon Noir",
      "image": null,
      "stages": [
        {
          "cost": "—",
          "size": 3,
          "type": "Puppet",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-1 Memory",
              "dados": "Destreza + Trevas",
              "title": "Mickey Bullet",
              "effect": "Role 1d4 ao ativar essa Skill; X é igual ao número tirado. X inimigos são escolhidos como alvo. Se os dados desse ataque rodarem uma Falha Crítica, mude o alvo para aliados.",
              "alcance": "projétil 8m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Destreza + Fogo",
              "title": "Bless Fire",
              "effect": "[Piercing]. Atinge todos os personagens que estiverem no caminho da linha desse ataque.",
              "alcance": "projétil 8m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "Digital Body +",
              "effect": "Caso seja atacada por um humano ou um Digimon de nível inferior, duplica sua Defesa atual até o final do Round.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Selfless Survive",
              "effect": "No início do turno de Sistermon Noir, ela perde 2 HP. Em seguida, concede Memory +2 para si mesma ou para 1 aliado à sua escolha. Caso o alvo não seja Sistermon Noir, o custo em HP é aumentado em +3.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "I still believe in you",
              "effect": "Todos os Digimons aliados do tipo [Small Dragon] e do atributo [Data] causam +2 de dano com seus ataques enquanto Noir estiver em batalha.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 25,
            "Defesa": 5,
            "Armadura": 0,
            "Iniciativa": 11,
            "Deslocamento": 15
          },
          "affinity": {
            "Fogo": 2,
            "Trevas": 3
          },
          "portrait": "black",
          "weakness": {
            "Letal (+2)": "Vacina",
            "Agravado (+3)": "Luz, Fogo",
            "Resistente (-2)": "Data"
          },
          "stageName": "Sistermon Noir",
          "attributes": {
            "Vigor": 4,
            "Força": 2,
            "Destreza": 6,
            "Presença": 4,
            "Raciocínio": 4,
            "Autocontrole": 5,
            "Inteligência": 4,
            "Manipulação": 3,
            "Perseverança": 0
          }
        }
      ],
      "sectors": [
        2
      ],
      "tamerId": null,
      "imageKey": "img-d-sistermon-noir-1780153283432",
      "currentStage": 0
    },
    {
      "id": "d-sistermon-ciel",
      "line": "Sistermon Ciel",
      "lore": "??? ↔ ??? ↔ Sistermon Ciel / Sistermon Noir ↔ ??? ↔ ???",
      "name": "Sistermon Ciel",
      "image": null,
      "stages": [
        {
          "cost": "—",
          "size": 3,
          "type": "Puppet",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Destreza + Físico",
              "title": "Shirotsume Ichimonji-giri",
              "effect": "Caso esteja acima do inimigo na ordem de turnos, ganha 1 carga de [Phantasm] antes do ataque ser concluído.",
              "alcance": "corpo a corpo 1m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-1 Memory",
              "dados": "Destreza + Físico",
              "title": "Byakusai",
              "effect": "Divide o dano total causado entre os dois inimigos igualmente. Se não for possível dividir igualmente, Ciel escolhe qual dos dois alvos tomará a maior parte do dano.",
              "alcance": "projétil 5m",
              "keyword": "Ataque"
            },
            {
              "type": "passive",
              "title": "Digital Body +",
              "effect": "Caso seja atacada por um humano ou um Digimon de nível inferior, duplica sua Defesa atual até o final do Round.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Survive +",
              "effect": "No início do turno do usuário, HP -2 e Memory +2.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Moving On",
              "effect": "Enquanto não houver um Digimon do tipo [Small Dragon] e do atributo [Data] em campo, Memory +1 no início do turno de Ciel.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 25,
            "Defesa": 5,
            "Armadura": 0,
            "Iniciativa": 11,
            "Deslocamento": 15
          },
          "affinity": {
            "Físico": 5
          },
          "portrait": "blue",
          "weakness": {
            "Letal (+2)": "Vírus",
            "Agravado (+3)": "Fogo, Gelo",
            "Resistente (-2)": "Vacina, Vento"
          },
          "stageName": "Sistermon Ciel",
          "attributes": {
            "Vigor": 4,
            "Força": 3,
            "Destreza": 6,
            "Presença": 3,
            "Raciocínio": 4,
            "Autocontrole": 5,
            "Inteligência": 4,
            "Manipulação": 3,
            "Perseverança": 0
          }
        }
      ],
      "sectors": [
        2
      ],
      "tamerId": null,
      "imageKey": "img-d-sistermon-ciel-1780153283432",
      "currentStage": 0
    },
    {
      "id": "d-yahiro-saki",
      "line": "Yahiro Saki",
      "lore": "Sem informação",
      "name": "Yahiro Saki",
      "image": null,
      "stages": [
        {
          "cost": "—",
          "size": 3,
          "type": "Illusion, SIGN 02",
          "image": null,
          "level": "N/A",
          "speed": 5,
          "hidden": false,
          "locked": false,
          "skills": [
            {
              "type": "action",
              "custo": "-1 Memory",
              "dados": "Inteligência + Madeira + 3d10",
              "title": "Sakura Festal",
              "effect": "Dano fixo: 4. Nenhum efeito adicional.",
              "alcance": "projétil 15m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "Nenhum",
              "dados": "Força + Físico + 2d10",
              "title": "Naginata",
              "effect": "Dano fixo: 5. Nenhum efeito adicional.",
              "alcance": "corpo a corpo 2m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-2 Memory",
              "dados": "Força + Físico + Madeira",
              "title": "Sakura Dance",
              "effect": "[Blast 2]. Dano fixo: 10.",
              "alcance": "corpo a corpo 3m",
              "keyword": "Ataque"
            },
            {
              "type": "action",
              "custo": "-1 Memory",
              "dados": "Manipulação + Enfraquecer",
              "title": "Withering",
              "effect": "Aplica 6 cargas de [Withering] no alvo. Withering: ao estourar, 5 dano imediato. Pelos 3 Rounds seguintes, no fim do turno do afetado, ele sofre o mesmo dano. Aplicações subsequentes aumentam o dano em +2 (máx 10). Resistir: Perseverança + Resistência.",
              "alcance": "projétil 5m",
              "keyword": "Efeito"
            },
            {
              "type": "passive",
              "title": "Transient Nature of Life",
              "effect": "Ataques contra alvos adjacentes à Yahiro Saki recebem [Assassinate] e ignoram Defesa.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Sakura Whimsical Stroll: Present",
              "effect": "No início do seu turno, Memory +2. Saki tem duas ações por turno. +2 Turnos na batalha — as iniciativas desses turnos são ½ e ⅓ do resultado da rolagem de iniciativa, respectivamente.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Sakura Whimsical Stroll: Hatred",
              "effect": "No início do seu turno, caso esteja em até 20 metros de onde [Yahiro Akugetsu] está, Memory +2.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 50,
            "Defesa": 7,
            "Armadura": 0,
            "Iniciativa": 2,
            "Deslocamento": 11
          },
          "affinity": {
            "Físico": 2,
            "Madeira": 3
          },
          "imageKey": "d-yahiro-saki-stage-0.png",
          "portrait": "rose",
          "weakness": {
            "Letal (+2)": "Variável",
            "Agravado (+3)": "Fogo, Físico",
            "Inefetivo (-3)": "Enfraquecer",
            "Resistente (-2)": "Variável"
          },
          "stageName": "Yahiro Saki",
          "attributes": {
            "Vigor": 2,
            "Força": 6,
            "Destreza": 3,
            "Presença": 2,
            "Raciocínio": 3,
            "Autocontrole": 3,
            "Inteligência": 6,
            "Manipulação": 5,
            "Perseverança": 1
          }
        }
      ],
      "sectors": [
        2
      ],
      "tamerId": null,
      "imageKey": null,
      "currentStage": 0
    },
    {
      "id": "d-sakura-fabrication",
      "line": "Sakura Fabrication",
      "lore": "Token invocado por Yahiro Saki",
      "name": "Sakura Fabrication",
      "image": null,
      "stages": [
        {
          "cost": "—",
          "size": 3,
          "type": "Token, Illusion, SIGN 02",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": false,
          "skills": [
            {
              "type": "passive",
              "title": "Digital Body",
              "effect": "Caso seja atacado por um humano, duplique sua Defesa atual até o final do Round.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Illusionary Touch",
              "effect": "Ao atacar um inimigo, o inimigo deve rolar sua Defesa ou Destreza + Esquiva; caso falhe na rolagem, ele receberá 3 de dano. Esses ataques não reduzem Defesa.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Wraith",
              "effect": "Imune a Ataques de Oportunidade.",
              "keyword": "Passiva"
            },
            {
              "type": "passive",
              "title": "Error",
              "effect": "Caso seja atingido por [De-Digivolve], é deletado.",
              "keyword": "Passiva"
            }
          ],
          "status": {
            "HP": 11,
            "Defesa": 3,
            "Armadura": 0,
            "Iniciativa": 6,
            "Deslocamento": 12
          },
          "affinity": {},
          "portrait": "rose",
          "weakness": {
            "Letal (+2)": "Variável",
            "Agravado (+3)": "Físico, Fogo",
            "Inefetivo (-3)": "Enfraquecer",
            "Resistente (-2)": "Variável"
          },
          "stageName": "Sakura Fabrication",
          "attributes": {
            "Vigor": 1,
            "Força": 1,
            "Destreza": 4,
            "Presença": 1,
            "Raciocínio": 1,
            "Autocontrole": 4,
            "Inteligência": 1,
            "Manipulação": 4,
            "Perseverança": 1
          }
        }
      ],
      "sectors": [
        2
      ],
      "tamerId": null,
      "imageKey": null,
      "currentStage": 0
    },
    {
      "id": "d-lianpumon-mprr4jc7",
      "line": "??? ↔ ??? ↔ ??? ↔ ??? ↔ ???",
      "name": "Lianpumon",
      "image": null,
      "stages": [
        {
          "cost": "0",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "In-Training (Lvl 2)",
          "speed": 5,
          "locked": false,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "sage",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 2,
            "Presença": 2,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 2
          }
        },
        {
          "cost": "0",
          "size": 3,
          "type": "Mutation",
          "image": null,
          "level": "Child (Lvl 3)",
          "speed": 5,
          "locked": false,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "black",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 2,
            "Presença": 2,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 2
          }
        },
        {
          "cost": "—",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Adult (Lvl 4)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "sage",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 2,
            "Presença": 2,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 2
          }
        },
        {
          "cost": "—",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Perfect (Lvl 5)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "sage",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 2,
            "Presença": 2,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 2
          }
        },
        {
          "cost": "—",
          "size": 3,
          "type": "???",
          "image": null,
          "level": "Ultimate (Lvl 6)",
          "speed": 5,
          "locked": true,
          "skills": [],
          "status": {
            "HP": 0,
            "Defesa": 0,
            "Armadura": 0,
            "Iniciativa": 0,
            "Deslocamento": 0
          },
          "affinity": {},
          "portrait": "sage",
          "weakness": {},
          "stageName": "???",
          "attributes": {
            "Vigor": 2,
            "Força": 2,
            "Destreza": 2,
            "Presença": 2,
            "Raciocínio": 2,
            "Autocontrole": 2,
            "Inteligência": 2,
            "Manipulação": 2,
            "Perseverança": 2
          }
        }
      ],
      "sectors": [],
      "tamerId": "t-karuma-mprr4jc7",
      "currentStage": 1,
      "imageKey": null
    }
  ],
  "skillTree": [],
  "survivors": [
    {
      "id": "sv-yahiro",
      "age": "17",
      "lore": [
        {
          "text": "Yahiro Akugetsu é a irmã mais velha de Hibito Akugetsu, uma estudante do terceiro ano da Escola Zaika e uma personagem secundária de Digimon Survive. Durante a infância, era conhecida por sua personalidade extrovertida, energética e bem-humorada. Entretanto, conforme cresceu, os conflitos trazidos pela falta de Naoki acabaram afetando-a mais do que esperava, levando Yahiro a se tornar cada vez mais rebelde e a começar a se envolver com grupos de reputação questionável.\n\nAs constantes discussões com os pais acabaram criando uma distância gradual entre ela e Hibito, deteriorando o relacionamento que os dois possuíam anteriormente. Após a morte dos pais, porém, Yahiro sofreu um forte “choque de realidade”, passando a tentar recuperar parte da pessoa que costumava ser, além de tentar reconstruir o laço perdido com o irmão mais novo.\n\nApesar de seus esforços, Yahiro ainda possui dificuldade em compreender verdadeiramente Hibito, algo agravado tanto por suas próprias inseguranças quanto pelas influências e relações problemáticas que mantém com algumas pessoas de sua classe.\n",
          "visible": true
        },
        {
          "text": " Ao ser transportada para o Mundo Digital, Yahiro acabou chegando ao Setor 2, onde sua quantidade anormalmente elevada de Digisoul rapidamente atraiu a atenção de diversos Digimons da região. Durante sua tentativa de sobrevivência, acabou sendo atacada por um Digimon afetado pelas Kemonobanas, sendo aparentemente salva por uma Angewomon. Entretanto, a entidade era, na verdade, uma ilusão criada pelo próprio SIGN 02.\n\nManipulada pela falsa Angewomon, Yahiro foi conduzida até um dos núcleos do programa, escondido no bosque do Setor 2. Utilizando a enorme energia de Digisoul da garota, o SIGN 02 criou as chamadas Câmaras Internas — um mundo ilusório formado a partir das memórias, emoções e sentimentos reprimidos de Yahiro — onde a manteve aprisionada enquanto drenava continuamente sua energia para utilizá-la como fonte de alimentação.\n\nEventualmente, Yahiro é resgatada pelo grupo protagonista das garras do SIGN 02 e, após ser libertada das ilusões das Câmaras Internas, passa a acompanhar os demais sobreviventes em sua jornada pelo Mundo Digital.",
          "visible": true
        },
        {
          "text": "",
          "visible": false
        }
      ],
      "name": "Yahiro",
      "sign": "Sagitário",
      "image": null,
      "voice": "Yui Ishikawa",
      "height": 158,
      "merits": [
        {
          "type": "passive",
          "title": "Nephilim",
          "effect": "Rolagens de habilidades [Social] contra Digimons que tenham \"Angel\" ou \"Devil\" no nome de seu tipo recebem +3 dados e 1 sucesso garantido.",
          "keyword": "Mérito"
        },
        {
          "type": "passive",
          "title": "Sakura Honey",
          "effect": "O Digisoul de Yahiro, ao ser ativado, IMEDIATAMENTE puxa a atenção de todos os Digimons e Bugs na zona onde ela está, tomando prioridade sobre qualquer outro Digisoul. Isso não funciona como [Decoy], os Digimons e Bugs ainda podem agir normalmente dependendo da situação e da inteligência deles.",
          "keyword": "Falha"
        },
        {
          "type": "passive",
          "title": "Arcana XII",
          "effect": "Rolagens de habilidades [Social] recebem -3 dados caso sejam feitas contra Eisuke, Mei ou Naoki. Caso seja feita contra Hibito, falha de forma crítica automaticamente.",
          "keyword": "Falha"
        }
      ],
      "skills": {
        "Mental": {
          "E.G.": 0,
          "P.S.": 0,
          "Ciência": 0,
          "Folclore": 0,
          "Notívago": 0,
          "Construção": 0,
          "Investigação": 0
        },
        "Social": {
          "Sorte": 0,
          "Empatia": 0,
          "Expressão": 0,
          "Persuasão": 0,
          "Socializar": 0,
          "Subterfúgio": 0,
          "Intimidação": 0
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 3,
          "Limpeza": 0,
          "Atletismo": 0,
          "Culinária": 0,
          "Furtividade": 0,
          "Sobrevivência": 0
        }
      },
      "status": {
        "HP": {
          "v": 7,
          "max": 7
        },
        "Digisoul": {
          "v": 10,
          "max": 10
        },
        "Iniciativa": 4,
        "Deslocamento": 8
      },
      "surname": "Akugetsu",
      "tagline": "Asas de Marfim, Asas de Ébano",
      "birthday": "17 de Dezembro",
      "imageKey": "sv-yahiro.png",
      "mindLink": {
        "active": false,
        "digimonId": null
      },
      "portrait": "mallow",
      "inventory": [
        {
          "id": "inv-mpol6zab",
          "qty": 1,
          "name": "Naginata",
          "tipo": "Arma",
          "efeito": "Exclusivo de Yahiro. Só pode ser usada caso [Sakura-zensen] esteja ativo. Aumenta as rolagens de ataques normais de Yahiro em +4 enquanto estiver equipada com essa arma.",
          "alcance": "Corpo a Corpo - 2 Metros",
          "descricao": "A Naginata usada por Yahiro Saki durante as Câmaras Internas. Quando a arma é movimentada, pétalas de cerejeiras ficam para trás"
        }
      ],
      "attributes": {
        "Poder": 3,
        "Refinamento": 3,
        "Resistência": 4
      },
      "survivorSkills": [
        {
          "type": "action",
          "custo": "-1 Digisoul",
          "title": "Memory Link: Feathers",
          "effect": "Yahiro dá Memory +3 para o Digimon escolhido.",
          "target": "1 Digimon aliado que não esteja conectado a um Digivice e tenha  \"Angel\" ou \"Devil\" no seu tipo",
          "keyword": "Efeito | Alcance: Corpo a corpo - 3 Quadrados | Cooldown: 3 Turnos "
        },
        {
          "type": "action",
          "custo": "Variável de acordo com a Skill copiada, muda qualquer custo de [Memory] para [Digisoul]",
          "title": "Mark of Oblivion",
          "effect": "A qualquer momento durante a batalha, Yahiro pode fazer com que [Mark of Oblivion] copie a identidade de uma skill \"Mark\" de um aliado humano que esteja ativo em combate junto à ela. [Mark of Oblivion] só volta à sua forma base depois de ser usada em sua versão copiada, e ela segue as regras da Skill na qual se transformou normalmente. ",
          "target": "Variável de acordo com a Skill copiada",
          "keyword": "Efeito"
        },
        {
          "type": "passive",
          "title": "Ivory Wings, Ebony Wings",
          "effect": "Yahiro tem duas barras de Digisoul, uma chamada de [Ivory Wings] e outra chamada de [Ebony Wings]. Ela pode usá-las da forma que achar melhor, seja intercaladamente ou gastar tudo de uma primeiro antes de ir para a outra. Ao trocar de barra, mude a cor de texto de Yahiro também.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "Shidarizakura",
          "effect": "Digisoul +1 toda vez que Yahiro receber dano ou cargas de um relógio de ferimento.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "Sakura Whimsical Stroll",
          "effect": "Quando Yahiro receber dano, o dano é reduzido em 50%, e metade do dano reduzido é convertida em cargas de [Anxiety] que são aplicadas na própria Yahiro. Enquanto tiver cargas de [Anxiety], Yahiro é considerada como se tivesse Defesa: 2, mas ela ainda pode rodar Esquiva e derivados. Todas as reduções causadas por essa Skill arredondam para cima o valor.",
          "keyword": "Passiva",
          "toggleBonus": {
            "statusBonus": {
              "Defesa": 2
            }
          }
        },
        {
          "type": "action",
          "custo": "-2 Digisoul",
          "title": "Sakura-zensen",
          "effect": "Desativa a proteção de Domain de Yahiro, aumenta as rolagens de Esquiva dela em +6 e a dá Defesa +2. Os efeitos de [Sakura-zensen] duram 5 Rounds, mas podem ser desativados com [Blitz] durante o turno de Yahiro. Enquanto essa Skill estiver ativa, ela tem acesso à Naginata de Saki em seu inventário.",
          "target": "Yahiro",
          "keyword": "Efeito",
          "toggleBonus": {
            "statusBonus": {
              "Defesa": 2
            }
          }
        }
      ]
    },
    {
      "id": "sv-mei-mpoljsxe",
      "age": "17",
      "lore": [
        {
          "text": "Mei Takamiya é uma estudante do terceiro ano, presidente do clube de moda e personagem secundária em Digimon Survive. No passado, sofreu bullying de suas senpais por usar twintails e por seu jeito considerado infantil e ingênuo. Após a formatura das garotas que a atormentavam, Mei decidiu provar seu valor mergulhando no mundo da moda e fundando seu próprio clube. Hoje, é reconhecida como uma das pessoas mais estilosas da escola e uma referência em moda, desfilando com orgulho seus twintails e seu amor pelo estilo Harajuku. É amiga de infância de Yahiro, Naoki, Eisuke e Hibito. Hibito ainda tem um crush nela até hoje.\n",
          "visible": true
        },
        {
          "text": "Ao ser transportada para o Mundo Digital, Mei foi parar na Fábrica Abandonada do Setor 2, onde sobreviveu com os recursos disponíveis. Após cinco dias sozinha, foi descoberta por um grupo de Digimons conhecido como \"D-Brigade\", que passou a caçá-la em busca de mais memória.  Por sorte, o grupo de Eisuke, Miki, Kumo, Shinra e Mori conseguiu resgatá-la a tempo e a levou de volta em segurança para a escola das Sistermons.",
          "visible": true
        },
        {
          "text": "",
          "visible": false
        }
      ],
      "name": "Mei",
      "sign": "Leão",
      "image": null,
      "voice": "Rie Kugimiya",
      "height": 150,
      "merits": [
        {
          "type": "passive",
          "title": "Fabulous!",
          "effect": "Rolagens que tenham relação com moda ou costura recebam +3 dados.",
          "keyword": "Mérito"
        },
        {
          "type": "passive",
          "title": "What YOU've been Looking For! ",
          "effect": "Rolagens que tenham relação com [Socializar] ou [Empatia] recebem +2 dados.",
          "keyword": "Mérito"
        },
        {
          "type": "passive",
          "title": "Not Now or Never",
          "effect": "Rolagens que tenham relação com esforço físico pesado recebem -3 dados.",
          "keyword": "Falha"
        },
        {
          "type": "passive",
          "title": "A Night to Remember",
          "effect": "Rolagens que tenham relação com [Perseverança] recebem +3 dados contanto que haja um amigo ou amiga de Mei por perto. Caso o personagem em questão seja Eisuke, Yahiro, Naoki ou Miki, Mei também ganha 1 sucesso automático",
          "keyword": "Mérito"
        }
      ],
      "skills": {
        "Mental": {
          "E.G.": 0,
          "P.S.": 0,
          "Ciência": 0,
          "Folclore": 0,
          "Notívago": 0,
          "Construção": 0,
          "Investigação": 0
        },
        "Social": {
          "Sorte": 0,
          "Empatia": 2,
          "Expressão": 0,
          "Persuasão": 0,
          "Socializar": 2,
          "Subterfúgio": 0,
          "Intimidação": 0
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 0,
          "Limpeza": 0,
          "Atletismo": 0,
          "Culinária": 0,
          "Furtividade": 0,
          "Sobrevivência": 0
        }
      },
      "status": {
        "HP": {
          "v": 6,
          "max": 6
        },
        "Digisoul": {
          "v": 6,
          "max": 6
        },
        "Iniciativa": 4,
        "Deslocamento": 10
      },
      "surname": "Takamiya",
      "tagline": "O que VOCÊ estava procurando!",
      "birthday": "21 de Agosto",
      "imageKey": "sv-mei-mpoljsxe.png",
      "mindLink": {
        "active": false,
        "digimonId": null
      },
      "portrait": "wheat",
      "inventory": [],
      "attributes": {
        "Poder": 3,
        "Refinamento": 4,
        "Resistência": 3
      },
      "survivorSkills": [
        {
          "type": "action",
          "custo": "-1 Digisoul",
          "title": "Memory Link",
          "effect": "Mei dá Memory +3 para o Digimon escolhido.",
          "target": "1 Digimon aliado que não esteja conectado a um Digivice e tenha o tipo [Kawaii]",
          "keyword": "Efeito | Alcance: Corpo a corpo - 1 Quadrado | Cooldown: 3 Turnos"
        },
        {
          "type": "passive",
          "title": "Cute is Justice!",
          "effect": "Adiciona o tipo [Kawaii] aos Digimons que Mei encontrar e achar fofos.",
          "keyword": "Passiva"
        },
        {
          "type": "passive",
          "title": "The Takamin Who Really, Really, Really, Really, REALLY Loves You All!",
          "effect": "Aliados humanos que forem curados por Mei ganham +1 dado em rolagens contra Condições Negativas  até o final do Round.",
          "keyword": "Passiva"
        },
        {
          "type": "action",
          "custo": "-2 Digisoul",
          "title": "Breaking Free!",
          "effect": "Recupera 4 de HP de todos os aliados humanos e Digimons que tenham o tipo [Kawaii]. Caso Naoki, Eisuke, Yahiro ou Miki estejam na batalha e tenham menos da metade do HP, Mei pode fazer uma rolagem de [Perseverança] durante qualquer momento da batalha para transformar essa Skill em uma Reação - que ela pode ativar quando um inimigo declarar um ataque - até o final do Round",
          "keyword": "Efeito | Alcance: Cone - 4 Metros"
        }
      ]
    },
    {
      "id": "sv-hino-mpry2ne3",
      "age": "18",
      "lore": [
        {
          "text": "",
          "visible": false
        },
        {
          "text": "",
          "visible": false
        },
        {
          "text": "",
          "visible": false
        }
      ],
      "name": "Hino",
      "sign": "Gêmeos",
      "image": null,
      "voice": "Showtaro Morikubo",
      "height": 180,
      "merits": [
        {
          "type": "passive",
          "title": "Scaredy Cat",
          "effect": "Ogami se assusta MUITO fácil. Enquanto assustado, todas suas rolagens sofrem uma penalidade de -3 dados.",
          "keyword": "Falha"
        },
        {
          "type": "passive",
          "title": "Casanova Wannabe",
          "effect": "Rolagens feitas para impressionar meninas recebem +1 dado. [Miki Sawatari] não é considerada uma menina para esse mérito.",
          "keyword": "Mérito"
        }
      ],
      "skills": {
        "Mental": {
          "E.G.": 0,
          "P.S.": 0,
          "Ciência": 0,
          "Folclore": 0,
          "Notívago": 0,
          "Construção": 0,
          "Investigação": 0
        },
        "Social": {
          "Sorte": 0,
          "Empatia": 0,
          "Expressão": 0,
          "Persuasão": 0,
          "Socializar": 0,
          "Subterfúgio": 0,
          "Intimidação": 0
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 0,
          "Limpeza": 0,
          "Atletismo": 0,
          "Culinária": 0,
          "Furtividade": 0,
          "Sobrevivência": 0
        }
      },
      "status": {
        "HP": {
          "v": 7,
          "max": 7
        },
        "Digisoul": {
          "v": 2,
          "max": 2
        },
        "Iniciativa": 4,
        "Deslocamento": 9
      },
      "surname": "Ogami",
      "tagline": "Quase um Casanova",
      "birthday": "21 de Maio",
      "imageKey": "sv-hino-mpry2ne3-1780124621353.webp",
      "mindLink": {
        "active": false,
        "digimonId": null
      },
      "portrait": "sage",
      "inventory": [],
      "attributes": {
        "Poder": 4,
        "Refinamento": 3,
        "Resistência": 3
      },
      "survivorSkills": [
        {
          "type": "action",
          "title": "Memory Link",
          "effect": "Hino dá Memory +3 para o Digimon escolhido.",
          "target": "1 Digimon Aliado que não esteja conectado a um Digivice e tenha o tipo [Femme]",
          "keyword": "Ação | Alcance: Corpo a Corpo - 1 Quadrado | Cooldown: 3 Turnos"
        },
        {
          "type": "passive",
          "title": "Looks Female Enough",
          "effect": "Adiciona o tipo [Femme] aos Digimons que Ogami encontrar e achar que são mulheres.",
          "keyword": "Passiva"
        }
      ]
    },
    {
      "id": "sv-yui-mpry51ab",
      "age": "17",
      "lore": [
        {
          "text": "Yui Kurumizawa é uma estudante do terceiro ano e integrante do clube de tênis da escola Zaika, aparecendo como personagem secundária em Digimon Survive. Considerada uma das alunas mais bonitas da escola, Yui tem um jeito tranquilo e prefere manter certa distância, embora seja bastante sociável quando decide interagir. Diferente de muitos, ela não trata com desdém o trio de Naoki, Shinra e Kumo, ainda que raramente converse com eles. Já teve dois namoros dentro da turma, mas nenhum foi adiante. Rumores dizem que está interessada em outra pessoa no momento — motivo pelo qual recusou a confissão de Shinra. \nAo ser transportada para o Mundo Digital, Yui apareceu próxima ao Vilarejo do Amor, alcançando-o após uma curta caminhada. Os Sukamons, surpresos com a presença de uma humana, acolheram-na com entusiasmo e passaram a acreditar em tudo que ela dizia. Aproveitando-se da situação, Yui contou diversas mentiras — como ser a verdadeira dona do Digivice encontrado ali e a portadora legítima do brasão do Amor. Suas ordens começaram simples, como dar nomes aos Sukamons e pedir que a chamassem de \"Afrodite\", mas logo escalaram. Hoje, os Sukamons têm nomes que terminam em \"-son\" e acreditam firmemente que Yui é uma deusa vinda do mundo humano para espalhar o amor pelo Mundo Digital.",
          "visible": true
        },
        {
          "text": "A pessoa que Yui gostava, surpreendentemente, era Shinra. Seus sentimentos surgiram pouco depois de se tornarem grandes amigos, mas ela optou por sufocá-los, temendo perder mais uma amizade por causa do amor. Após sua passagem pelo Vilarejo do Amor e uma conversa sincera com Naoki, Yui se arrepende profundamente de não ter se declarado. Ainda assim, aceita que o momento passou e que talvez tenha perdido a chance de viver algo especial com alguém por quem sente tanto. A frustração persiste, mas ela entende que isso faz parte do seu amadurecimento.",
          "visible": true
        },
        {
          "text": "",
          "visible": false
        }
      ],
      "name": "Yui",
      "sign": "Libra",
      "image": null,
      "voice": "Saori Hayami",
      "height": 160,
      "merits": [
        {
          "type": "passive",
          "title": "With Love, from Yui!",
          "effect": "Rolagens que tenham relação com [Culinária] recebem +3 dados. Caso seja em prol de seus amigos, Yui tem +1 sucesso garantido. Caso Shinra ou Yuri vão aproveitar disso de alguma forma, +1 sucesso garantido.",
          "keyword": "Mérito"
        },
        {
          "type": "passive",
          "title": "Bad Romance",
          "effect": "Rolagens sociais em interações com Digimons do tipo [Vírus] recebem +3 dados.",
          "keyword": "Mérito"
        },
        {
          "type": "passive",
          "title": "About love and other Feelings",
          "effect": "Rolagens de resistência contra [Charm] recebem -3 dados e tem -1 sucesso.",
          "keyword": "Falha"
        }
      ],
      "skills": {
        "Mental": {
          "E.G.": 0,
          "P.S.": 0,
          "Ciência": 0,
          "Folclore": 0,
          "Notívago": 0,
          "Construção": 0,
          "Investigação": 0
        },
        "Social": {
          "Sorte": 0,
          "Empatia": 0,
          "Expressão": 0,
          "Persuasão": 0,
          "Socializar": 0,
          "Subterfúgio": 0,
          "Intimidação": 0
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 0,
          "Limpeza": 0,
          "Atletismo": 0,
          "Culinária": 3,
          "Furtividade": 0,
          "Sobrevivência": 0
        }
      },
      "status": {
        "HP": {
          "v": 6,
          "max": 6
        },
        "Digisoul": {
          "v": 3,
          "max": 3
        },
        "Iniciativa": 4,
        "Deslocamento": 7
      },
      "surname": "Kurumizawa",
      "tagline": "Bem me quer, mal me quer",
      "birthday": "24 de Setembro",
      "imageKey": "sv-yui-mpry51ab-1780125590613.webp",
      "mindLink": {
        "active": false,
        "digimonId": null
      },
      "portrait": "thistle",
      "inventory": [],
      "attributes": {
        "Poder": 3,
        "Refinamento": 3,
        "Resistência": 4
      },
      "survivorSkills": [
        {
          "type": "action",
          "custo": "-1 Digisoul",
          "title": "Memory Link",
          "effect": "Yui dá Memory +3 para o Digimon escolhido.",
          "target": "1 Digimon aliado que não esteja conectado a um Digivice e que tenha \"Knight\" em seus tipos",
          "keyword": "Efeito | Alcance: Corpo a corpo - 1 Quadrado | Cooldown: 3 turnos"
        },
        {
          "type": "passive",
          "title": "Petal by Petal, I recall",
          "effect": "Caso Yui esteja dentro do [Domain of Nature], quando uma passiva do Domain se ativar no início do Round, Yui ganha Digisoul +1.",
          "keyword": "Passiva"
        }
      ]
    },
    {
      "id": "sv-makoto-mpry8ccj",
      "age": "17",
      "lore": [
        {
          "text": "",
          "visible": false
        },
        {
          "text": "",
          "visible": false
        },
        {
          "text": "",
          "visible": false
        }
      ],
      "name": "Makoto",
      "sign": "Escorpião",
      "image": null,
      "voice": "Tetsuya Kakihara",
      "height": 175,
      "merits": [],
      "skills": {
        "Mental": {
          "E.G.": 0,
          "P.S.": 0,
          "Ciência": 0,
          "Folclore": 0,
          "Notívago": 0,
          "Construção": 0,
          "Investigação": 0
        },
        "Social": {
          "Sorte": 0,
          "Empatia": 0,
          "Expressão": 0,
          "Persuasão": 0,
          "Socializar": 0,
          "Subterfúgio": 0,
          "Intimidação": 0
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 0,
          "Limpeza": 0,
          "Atletismo": 0,
          "Culinária": 0,
          "Furtividade": 0,
          "Sobrevivência": 0
        }
      },
      "status": {
        "HP": {
          "v": 10,
          "max": 10
        },
        "Digisoul": {
          "v": 5,
          "max": 5
        },
        "Iniciativa": 3,
        "Deslocamento": 3
      },
      "surname": "Daidouji",
      "birthday": "15 de Novembro",
      "imageKey": "sv-makoto-mpry8ccj.png",
      "mindLink": {
        "active": false,
        "digimonId": null
      },
      "portrait": "coral",
      "inventory": [],
      "attributes": {
        "Poder": 2,
        "Refinamento": 2,
        "Resistência": 2
      },
      "survivorSkills": []
    },
    {
      "id": "sv-kimimaro-mpry9yiz",
      "age": "18",
      "lore": [
        {
          "text": "Kimimaro é um estudante do terceiro ano da escola Zaika, capitão do clube de vôlei e personagem secundário em Digimon Survive. Conhecido pelo apelido de \"Ouji-sama\" devido à sua beleza, bondade e popularidade, é um dos melhores alunos da turma, geralmente empatando em notas com Yuri. Sociável e querido tanto por garotas quanto por garotos, é o completo oposto do trio de idiotas. Já saiu com Emi e teve um relacionamento com Yui. Apesar de sua imagem impecável, Kimimaro esconde sua verdadeira natureza: ele é, na verdade, o principal responsável por manter o bullying contra Hibito até hoje.",
          "visible": true
        },
        {
          "text": "Ao ser transportado para o Mundo Digital, Kimimaro foi parar na entrada do Vale dos Trailmons do Setor 2, onde contou com a ajuda de Sora, Shun, Shiro e Saika para sobreviver sem dificuldades. Após cinco dias com eles, foi encontrado pelo grupo de Mori, Naoki, Shinra, Kanade e Emi. Chegou a considerar ficar na estação, mas Mori rapidamente descartou essa possibilidade. Atualmente, Kimimaro é o único entre os personagens secundários capaz de controlar o Digisoul livremente.\n",
          "visible": true
        },
        {
          "text": "",
          "visible": false
        }
      ],
      "name": "Kimimaro",
      "sign": "Áries",
      "image": null,
      "voice": "Daisuke Namikawa",
      "height": 178,
      "merits": [
        {
          "type": "passive",
          "title": "Perfectionist",
          "effect": "A primeira rolagem de Kimimaro em uma cena ou batalha receberá +3 dados.",
          "keyword": "Mérito"
        },
        {
          "type": "passive",
          "title": "Charisma",
          "effect": "Rolagens que tenham relação com status ou skills sociais recebem +3 dados. Não funciona com Digimons.",
          "keyword": "Mérito"
        },
        {
          "type": "passive",
          "title": "Egotist",
          "effect": "Caso Kimimaro falhe uma rolagem e o próximo personagem que rolar depois dele for um outro NPC, caso esse NPC consiga um sucesso, Kimimaro receberá -3 dados em sua próxima rolagem.",
          "keyword": "Falha"
        }
      ],
      "skills": {
        "Mental": {
          "E.G.": 0,
          "P.S.": 0,
          "Ciência": 0,
          "Folclore": 0,
          "Notívago": 0,
          "Construção": 0,
          "Investigação": 0
        },
        "Social": {
          "Sorte": 3,
          "Empatia": 3,
          "Expressão": 3,
          "Persuasão": 3,
          "Socializar": 3,
          "Subterfúgio": 3,
          "Intimidação": 3
        },
        "Físico": {
          "Briga": 0,
          "Esquiva": 0,
          "Limpeza": 0,
          "Atletismo": 0,
          "Culinária": 0,
          "Furtividade": 0,
          "Sobrevivência": 0
        }
      },
      "status": {
        "HP": {
          "v": 7,
          "max": 7
        },
        "Digisoul": {
          "v": 4,
          "max": 4
        },
        "Iniciativa": 5,
        "Deslocamento": 8
      },
      "surname": "Oikawa",
      "tagline": "Próximo da perfeição",
      "birthday": "1 de Abril",
      "imageKey": "sv-kimimaro-mpry9yiz-1780125272928.webp",
      "mindLink": {
        "active": false,
        "digimonId": null
      },
      "portrait": "slate",
      "inventory": [],
      "attributes": {
        "Poder": 4,
        "Refinamento": 4,
        "Resistência": 4
      },
      "survivorSkills": [
        {
          "type": "action",
          "custo": "-1 Digisoul",
          "title": "Memory Link",
          "effect": "Kimimaro dá Memory +3 para o Digimon escolhido.",
          "target": "1 Digimon aliado que não esteja conectado a um Digivice",
          "keyword": "Ação | Alcance: Corpo a corpo - 1 Quadrado | Cooldown: 2 turnos"
        }
      ]
    }
  ],
  "tokenDefs": [
    {
      "hp": 1,
      "id": "token-silhouette",
      "dano": 6,
      "name": "Silhouette Token",
      "type": "Digimon",
      "dados": "Perseverança de Hare + Fogo de Ghostmon",
      "level": "",
      "defesa": 0,
      "effect": "[Jamming], [Blocker].",
      "origin": "Hibito — Soul Ablaze / Twilight Memories",
      "alcance": "Corpo a Corpo - 1 Metro",
      "visible": true,
      "armadura": 0,
      "attribute": "No Data",
      "deslocamento": "Igual ao de Hibito",
      "autoConditions": [
        {
          "max": 1,
          "color": "teal",
          "label": "Blocker",
          "filled": 1
        },
        {
          "max": 1,
          "color": "indigo",
          "label": "Jamming",
          "filled": 1
        }
      ],
      "securityAttack": 0
    },
    {
      "hp": 1,
      "id": "token-puppet",
      "dano": 1,
      "name": "Puppet Token",
      "type": "Digimon",
      "dados": "Expressão de Sachi + Físico de Black Tailmon",
      "level": "Lv.3",
      "defesa": 1,
      "effect": "Ao ser invocado, imediatamente faça uma ação de movimento e ataque um alvo válido. Deletado no início do próximo turno de Sachi.",
      "origin": "Sachi — Puppet Theater",
      "alcance": "Corpo a Corpo - 1 Metro",
      "visible": true,
      "armadura": 0,
      "attribute": "No Data",
      "deslocamento": "Igual ao de Sachi",
      "autoConditions": [],
      "securityAttack": 1
    },
    {
      "hp": 3,
      "id": "token-enhanced-puppet",
      "dano": 3,
      "name": "Enhanced Puppet Token",
      "type": "Digimon",
      "dados": "Expressão de Sachi + Físico de Black Tailmon + 3d10",
      "level": "Lv.4",
      "defesa": 3,
      "effect": "Ao ser invocado, imediatamente faça uma ação de movimento e ataque um alvo válido. Deletado no início do próximo turno de Sachi.",
      "origin": "Sachi — Catharsis",
      "alcance": "Corpo a Corpo - 3 Metros",
      "visible": true,
      "armadura": 0,
      "attribute": "No Data",
      "deslocamento": "Igual ao de Sachi +3",
      "autoConditions": [],
      "securityAttack": 2
    }
  ],
  "bugFolders": [
    {
      "cls": "ledo",
      "color": "red"
    },
    {
      "cls": "chi",
      "color": "green"
    },
    {
      "cls": "haru",
      "color": "white"
    }
  ],
  "visibility": {
    "tamer:t-emi": "full",
    "tamer:t-hare": "full",
    "tamer:t-kumo": "full",
    "tamer:t-miki": "full",
    "tamer:t-mori": "full",
    "tamer:t-yuri": "full",
    "tamer:t-naoki": "full",
    "tamer:t-sachi": "full",
    "bug:b-ledo-low": "full",
    "tamer:t-eisuke": "full",
    "tamer:t-hibito": "full",
    "tamer:t-kanade": "full",
    "tamer:t-shinra": "full",
    "bug:b-ledo-high": "full",
    "bug:b-ledo-hood": "full",
    "bestiary:d-greymon": "full",
    "bug:b-ledo-trivial": "full",
    "survivor:sv-yahiro": "full",
    "bug:b-chi-chevalier": "full",
    "bug:b-chi-priestess": "full",
    "bestiary:d-yahiro-saki": "full",
    "bestiary:d-pico-devimon": "full",
    "tamer:t-karuma-mprr4jc7": "full",
    "survivor:sv-mei-mpoljsxe": "full",
    "bestiary:d-sistermon-ciel": "full",
    "bestiary:d-sistermon-noir": "full",
    "bestiary:d-sistermon-blanc": "full",
    "bestiary:d-sakura-fabrication": "full"
  },
  "customClimas": [],
  "customKeywords": [],
  "jogressConfigs": [
    {
      "id": "jcfg-mprpozem",
      "name": "Domain of Fábio",
      "lock1Id": "t-emi",
      "lock2Id": "t-kumo",
      "visible": true,
      "lock1Skills": [],
      "lock2Skills": [],
      "ownPassives": [],
      "memoryGroups": [
        {
          "id": "jg-mprponx3",
          "domain": "Domain of Emotion",
          "skills": []
        }
      ]
    }
  ],
  "customConditions": [
    {
      "id": "cond-base-burn",
      "desc": "Ao estourar: **7 dano** (humano: 4). Por 3 Rounds, no fim do turno sofre o mesmo dano.",
      "name": "Burn",
      "type": "wound",
      "resist": "Vigor + Resistência",
      "category": "Ferimento"
    },
    {
      "id": "cond-base-poison",
      "desc": "Ao estourar: **1 dano**. Por 3 Rounds, ao rolar dados sofre 1 dano por dado rolado.",
      "name": "Poison",
      "type": "wound",
      "resist": "Vigor + Resistência",
      "category": "Ferimento"
    },
    {
      "id": "cond-base-bleed",
      "desc": "Ao estourar: **3 dano**. Por 3 Rounds, ao mover ou atacar corpo a corpo sofre 2 dano.",
      "name": "Bleed",
      "type": "wound",
      "resist": "Vigor + Resistência",
      "category": "Ferimento"
    },
    {
      "id": "cond-base-curse",
      "desc": "Ao estourar: perde **2 Memory**. Por 3 Rounds, no fim do turno perde 1 Memory; sem Memory, perde HP equivalente.",
      "name": "Curse",
      "type": "wound",
      "resist": "Perseverança + Resistência",
      "category": "Ferimento"
    },
    {
      "id": "cond-base-sleep",
      "desc": "1ª carga recupera HP total. Adormecido não age/reage, Defesa ignorada, ataques causam dano total. Remove no fim do próximo turno ou ao sofrer dano.",
      "name": "Sleep (máx 3)",
      "type": "stack",
      "resist": "Vigor + Resistência",
      "category": "Acumulação"
    },
    {
      "id": "cond-base-charm",
      "desc": "Próxima ação é controlada pelo aplicador. Cargas extras controlam ações extras. Remove após executar.",
      "name": "Charm (máx 3)",
      "type": "stack",
      "resist": "Autocontrole + Resistência",
      "category": "Acumulação"
    },
    {
      "id": "cond-base-bind",
      "desc": "−5 Deslocamento por carga. Se Deslocamento chegar a 0, no próximo turno perde o turno e remove cargas.",
      "name": "Bind (máx 5)",
      "type": "stack",
      "resist": "Destreza + Resistência",
      "category": "Acumulação"
    },
    {
      "id": "cond-base-paralysis",
      "desc": "−3 dados em **todas** as rolagens. No fim do turno remove 1 carga.",
      "name": "Paralysis (máx 5)",
      "type": "stack",
      "resist": "Perseverança + Resistência",
      "category": "Acumulação"
    },
    {
      "id": "cond-base-mist",
      "desc": "A cada 2 cargas, dano recebido +1. Com 9+ cargas, rolagens contra o alvo ganham +1 sucesso.",
      "name": "Mist (máx 10)",
      "type": "stack",
      "resist": "Destreza + Resistência",
      "category": "Acumulação"
    },
    {
      "id": "cond-base-dedigiv",
      "desc": "Regride 1 nível por carga (cargas simultâneas acumulam). Após regressão, remove todas as cargas.",
      "name": "De-Digivolve (máx 3)",
      "type": "stack",
      "resist": "Perseverança + Resistência",
      "category": "Acumulação"
    },
    {
      "id": "cond-base-decoy",
      "desc": "No início do turno de cada inimigo, ele rola Inteligência + Resistência. Falha obriga a atacar o alvo do Decoy. Remove 1 carga no fim do turno do afetado.",
      "name": "Decoy (máx 3)",
      "type": "stack",
      "resist": "Presença + Resistência",
      "category": "Acumulação"
    },
    {
      "id": "cond-base-flight",
      "desc": "Imune a ataques corpo a corpo. Ignora obstáculos e áreas impassáveis. No fim do turno perde 1 carga.",
      "name": "Flight",
      "type": "positive",
      "category": "Positivas de Acumulação"
    },
    {
      "id": "cond-base-haste",
      "desc": "+5 Deslocamento por carga. Se Deslocamento ≥ 21, ganha turno extra (iniciativa = metade do principal). Remove todas ao ativar.",
      "name": "Haste (máx 2)",
      "type": "positive",
      "category": "Positivas de Acumulação"
    },
    {
      "id": "cond-base-blind",
      "desc": "Todas as rolagens viram **Chance Rolls** (1d10, sucesso só com 10). Ações de escolha de alvo também.",
      "name": "Blind",
      "type": "neg",
      "resist": "Raciocínio + Resistência",
      "category": "Permanentes — Negativas"
    },
    {
      "id": "cond-base-rage",
      "desc": "+1 sucesso em ataques no próprio turno, mas **deve atacar quem aplicou**. Se não causar dano, −2 sucessos em tudo no turno seguinte; depois remove.",
      "name": "Rage",
      "type": "neg",
      "resist": "Autocontrole + Resistência",
      "category": "Permanentes — Negativas"
    },
    {
      "id": "cond-base-bbwolf",
      "desc": "Ações de Ledo contra o alvo ganham efeitos extras descritos nas skills. Dura até fim do combate ou remoção específica.",
      "name": "Big Bad Wolf",
      "type": "neg",
      "resist": "Força + Resistência",
      "category": "Permanentes — Negativas"
    },
    {
      "id": "cond-base-sacrifice",
      "desc": "Memory vai a 0 e fica bloqueada. Alvo não age/reage nem pode sair. Um [SIGN] pode converter 30% do MAXHP em Memory. Só remove com ação complexa + Digivice de autoridade ≥ do [SIGN].",
      "name": "Sacrifice (só humanos)",
      "type": "neg",
      "category": "Permanentes — Negativas"
    },
    {
      "id": "cond-base-phantasm",
      "desc": "Não pode receber Blocker/Decoy nem ser alvo de ataques/efeitos. Se atacar, acerta automaticamente e causa dano total. Remove ao atacar.",
      "name": "Phantasm",
      "type": "positive",
      "category": "Permanentes — Positivas"
    },
    {
      "id": "cond-base-armorev",
      "desc": "Muda o nível para Armor. Permanece enquanto a barra Digimental for maior que 0.",
      "name": "Armor Evolution",
      "type": "positive",
      "category": "Permanentes — Positivas"
    },
    {
      "id": "cond-base-reboot",
      "desc": "Pode usar reações no turno inimigo como Ações Livres. Cada reação remove 1 carga. Se não usar, remove todas no fim do round.",
      "name": "Reboot",
      "type": "positive",
      "category": "Permanentes — Positivas"
    },
    {
      "id": "cond-base-unsuspend",
      "desc": "Pode realizar ataques como Ações Livres no próprio turno. Cada ataque remove 1 carga. Se não atacar, remove todas no fim do turno.",
      "name": "Unsuspend",
      "type": "positive",
      "category": "Permanentes — Positivas"
    },
    {
      "id": "cond-mpobgn2w",
      "desc": "Ao estourar: **6 de dano** (humano: 3). Caso não seja um humano, também recebe 3 cargas de [Paralysis]. Caso seja humano, perde o seu próximo turno.",
      "name": "Anxiety",
      "type": "wound",
      "resist": "Autocontrole + Resistência",
      "category": "Ferimento"
    }
  ]
} as any as AppState;
  return s;
}

// ─── State management functions (use local buildDefaultState) ─────────────────
export function loadState(): AppState {
  const defaults = buildDefaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as AppState;
      return applyDefaultImages(mergeWithDefaults(saved, defaults));
    }
  } catch { /* corrupted — try IndexedDB asynchronously */ }
  return applyDefaultImages(defaults);
}

export async function loadStateAsync(): Promise<AppState> {
  const defaults = buildDefaultState();
  let merged: AppState | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as AppState;
      merged = mergeWithDefaults(saved, defaults);
    }
  } catch { /* localStorage failed */ }
  if (!merged) {
    const idb = await idbLoad();
    if (idb) merged = mergeWithDefaults(idb, defaults);
  }
  if (!merged) return defaults;
  return hydrateImages(merged);
}

export function resetState(): AppState {
  localStorage.removeItem(STORAGE_KEY);
  idbSave(buildDefaultState());
  return buildDefaultState();
}
