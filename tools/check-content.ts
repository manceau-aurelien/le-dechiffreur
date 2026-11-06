// Bloque la construction si le contenu viole une règle du cahier des charges (§4.6).
import { existsSync, readFileSync } from 'node:fs';
import { listClips, loadContent, words } from './lib.ts';

const errors: string[] = [];
const content = loadContent();
const { tier, city, bricks, boss, sentences, formulas, traps, exercises } = content;
const byId = new Map(bricks.map((b) => [b.id, b]));
const lower = (id: string) => byId.get(id)?.en.toLowerCase();

const nodeOrder = new Map(tier.nodes.map((n, i) => [n.id, i]));
const trackedIds = new Set(bricks.filter((b) => b.tracked).map((b) => b.id));
const formulaIds = new Set(formulas.map((f) => f.id));
const trapIds = new Set(traps.map((t) => t.id));
const sentenceById = new Map(sentences.map((s) => [s.id, s]));
const exerciseById = new Map(exercises.map((e) => [e.id, e]));

const unique = (label: string, ids: string[]) => {
  if (new Set(ids).size !== ids.length) errors.push(`${label} : identifiants en double`);
};
const checkElement = (where: string, el: string) => {
  if (el.startsWith('b.') && !trackedIds.has(el)) errors.push(`${where} : ${el} n'est pas une brique suivie`);
  if (el.startsWith('f.') && !formulaIds.has(el)) errors.push(`${where} : formule inconnue ${el}`);
  if (el.startsWith('t.') && !trapIds.has(el)) errors.push(`${where} : piège inconnu ${el}`);
};

// Règle 1 : identifiants uniques et références existantes
unique('Briques', bricks.map((b) => b.id));
unique('Phrases', sentences.map((s) => s.id));
unique('Exercices', exercises.map((e) => e.id));
unique('Nœuds', tier.nodes.map((n) => n.id));
for (const b of bricks) {
  for (const c of b.confusableWith) if (!byId.has(c)) errors.push(`${b.id} : proche inconnu ${c}`);
  if (!nodeOrder.has(b.nodeId)) errors.push(`${b.id} : nœud inconnu ${b.nodeId}`);
  if (b.kind === 'tool' && !b.ownerFormula) errors.push(`${b.id} : outil sans formule porteuse`);
}
if (!byId.has(tier.soundTestBrickId)) errors.push(`Brique de test du son inconnue : ${tier.soundTestBrickId}`);

// La carte introduit chaque brique suivie exactement une fois, au nœud annoncé.
const mapped = tier.nodes.flatMap((n) => (n.brickIds ?? []).map((id) => ({ id, node: n.id })));
unique('Briques de la carte', mapped.map((m) => m.id));
for (const m of mapped) {
  if (!trackedIds.has(m.id)) errors.push(`Carte : ${m.id} n'est pas une brique suivie`);
  else if (byId.get(m.id)!.nodeId !== m.node) errors.push(`Carte : ${m.id} attendu au nœud ${byId.get(m.id)!.nodeId}`);
}
for (const id of trackedIds) if (!mapped.some((m) => m.id === id)) errors.push(`Carte : ${id} n'est jamais introduite`);
for (const n of tier.nodes) {
  if (n.kind === 'vein' && !n.brickIds?.length) errors.push(`${n.id} : filon sans brique`);
  if (n.kind === 'formula' && !formulaIds.has(n.formulaId ?? '')) errors.push(`${n.id} : formule manquante`);
  for (const t of n.trapIds ?? []) if (!trapIds.has(t)) errors.push(`${n.id} : piège inconnu ${t}`);
}
for (const t of traps) {
  if (!tier.nodes.some((n) => n.trapIds?.includes(t.id))) errors.push(`${t.id} : aucun nœud ne le débloque`);
  for (const e of t.exerciseIds) if (!exerciseById.has(e)) errors.push(`${t.id} : exercice inconnu ${e}`);
  if (t.linkedSentenceId && !sentenceById.has(t.linkedSentenceId)) errors.push(`${t.id} : phrase inconnue`);
}

// Règle 2 : chaque mot d'une phrase est une brique déjà introduite à ce point de la carte.
// Un quartier ne dépend que du Port et de lui-même : ils se visitent dans n'importe quel ordre.
const nodeById = new Map(tier.nodes.map((n) => [n.id, n]));
const introduced = (brickId: string, nodeId: string) => {
  const from = nodeById.get(byId.get(brickId)?.nodeId ?? '');
  if (!from || (nodeOrder.get(from.id) ?? Infinity) > (nodeOrder.get(nodeId) ?? -1)) return false;
  return !from.districtId || from.districtId === nodeById.get(nodeId)?.districtId;
};
for (const s of sentences) {
  if (!nodeOrder.has(s.minNodeId)) errors.push(`${s.id} : nœud inconnu ${s.minNodeId}`);
  if (!s.acceptedEn.every((a) => a.trim())) errors.push(`${s.id} : variante vide`);
  const joined = s.bricks.map(lower).join(' ');
  if (joined !== words(s.en).join(' ')) errors.push(`${s.id} : briques et texte diffèrent (${joined})`);
  for (const b of s.bricks) {
    if (!byId.has(b)) errors.push(`${s.id} : brique inconnue ${b}`);
    else if (!introduced(b, s.minNodeId)) errors.push(`${s.id} : ${b} n'est pas encore introduite au nœud ${s.minNodeId}`);
  }
  for (const f of s.formulaIds) if (!formulaIds.has(f)) errors.push(`${s.id} : formule inconnue ${f}`);
}
for (const id of trackedIds) {
  if (!sentences.some((s) => s.bricks.includes(id))) errors.push(`${id} : aucune phrase ne l'utilise`);
}

// Formules : indices jouables, dernière épreuve en E8, sept références existantes
for (const f of formulas) {
  const node = tier.nodes.find((n) => n.formulaId === f.id);
  for (const c of f.clueSentenceIds) {
    const s = sentenceById.get(c);
    if (!s) errors.push(`${f.id} : indice inconnu ${c}`);
    else if (node && s.minNodeId !== node.id) errors.push(`${f.id} : l'indice ${c} n'appartient pas au nœud ${node.id}`);
  }
  if (f.hypothesis.options.filter((o) => o.correct).length !== 1) errors.push(`${f.id} : une seule hypothèse juste`);
  f.trial.positions.forEach((position, i) => {
    for (const ref of position) {
      if (ref.type === 'E9' || ref.type === 'E10') {
        const e = exerciseById.get(ref.id);
        if (!e || e.type !== ref.type) errors.push(`${f.id} : exercice ${ref.id} inconnu ou mal typé`);
      } else if (!sentenceById.has(ref.id)) errors.push(`${f.id} : phrase ${ref.id} inconnue`);
    }
    if (i === 5 && position.some((r) => r.type !== 'E8')) errors.push(`${f.id} : la dernière épreuve doit être un E8`);
  });
  const clues = new Set(f.clueSentenceIds);
  for (const ref of f.trial.positions[5]) if (clues.has(ref.id)) errors.push(`${f.id} : l'E8 final utilise un indice déjà vu`);
  for (const p of f.errorPatterns) {
    checkElement(`${f.id}/${p.id}`, p.blame);
    try {
      new RegExp(p.match);
    } catch {
      errors.push(`${f.id}/${p.id} : expression invalide`);
    }
  }
}

// Règle 3 : chaque réponse fausse a ses champs pourquoi et aRetenir.
for (const e of exercises) {
  e.targets.forEach((t) => checkElement(e.id, t));
  if (e.type === 'E10') {
    if (!e.tokens[e.wrongIndex]) errors.push(`${e.id} : brique fausse hors phrase`);
    if (!e.replacements.includes(e.correct)) errors.push(`${e.id} : bonne brique absente des choix`);
    continue;
  }
  if (e.options.filter((o) => o.correct).length !== 1) errors.push(`${e.id} : une seule bonne réponse attendue`);
  for (const o of e.options) {
    if (!o.correct && (!o.pourquoi?.trim() || !o.aRetenir?.trim())) errors.push(`${e.id} : « ${o.text} » sans explication`);
  }
  if (e.type === 'E11' && !sentenceById.get(e.audioSentenceId)?.guardianAudio) {
    errors.push(`${e.id} : la phrase n'a pas de clip avec la voix du Gardien`);
  }
}

// Chaque quartier montre ce qu'il réutilise, avec de vraies phrases du Port et du quartier.
unique('Quartiers', city.districts.map((d) => d.id));
for (const d of city.districts) {
  if (d.nodes.length && d.reuses.length < 4) errors.push(`${d.id} : au moins 4 fondamentaux réutilisés attendus`);
  for (const r of d.reuses) {
    const where = `${d.id}/${r.element}`;
    checkElement(where, r.element);
    if (r.element.startsWith('b.') && nodeById.get(byId.get(r.element)?.nodeId ?? '')?.districtId) errors.push(`${where} : ce n'est pas un fondamental du Port`);
    const before = sentenceById.get(r.beforeSentenceId);
    const after = sentenceById.get(r.afterSentenceId);
    if (!before || nodeById.get(before.minNodeId)?.districtId) errors.push(`${where} : la phrase d'avant doit venir du Port`);
    if (!after || nodeById.get(after.minNodeId)?.districtId !== d.id) errors.push(`${where} : la phrase d'après doit venir du quartier`);
    for (const x of [before, after]) {
      if (!x) continue;
      if (!words(x.en).includes(r.word.toLowerCase())) errors.push(`${where} : « ${r.word} » absent de ${x.id}`);
      const uses = r.element.startsWith('b.') ? x.bricks.includes(r.element) : x.formulaIds.includes(r.element);
      if (!uses) errors.push(`${where} : ${x.id} n'utilise pas cet élément`);
    }
  }
}

// Structure du boss
if (boss.ranks.length !== 10) errors.push(`Le boss doit avoir 10 rangs, il en a ${boss.ranks.length}`);
unique('Variantes', boss.ranks.flatMap((r) => r.variants.map((v) => v.id)));
boss.ranks.forEach((rank, i) => {
  if (rank.order !== i + 1) errors.push(`Rang mal ordonné : ${rank.order}`);
  if (rank.variants.length !== 3) errors.push(`Rang ${rank.order} : 3 variantes attendues`);
  for (const v of rank.variants) {
    const unknown = [...v.tokens, ...v.distractors].filter((t) => !byId.has(t));
    if (unknown.length) errors.push(`${v.id} : briques inconnues ${unknown.join(', ')}`);

    // La séquence attendue doit correspondre exactement à ce qui est prononcé.
    if (v.tokens.map(lower).join(' ') !== words(v.audio).join(' ')) errors.push(`${v.id} : tokens et audio diffèrent`);

    const bank = [...v.tokens, ...v.distractors];
    if (bank.length > 15) errors.push(`${v.id} : banque de ${bank.length} briques (15 au plus)`);

    // Règle 4 : règle du pivot
    const counts = new Map<string, number>();
    for (const b of bank) counts.set(lower(b) ?? b, (counts.get(lower(b) ?? b) ?? 0) + 1);
    for (const alt of v.pivotAlternatives) {
      if (words(alt).join(' ') === words(v.audio).join(' ')) {
        errors.push(`${v.id} : la phrase concurrente est la phrase prononcée`);
      }
      const left = new Map(counts);
      for (const w of words(alt)) {
        const n = left.get(w) ?? 0;
        if (n === 0) errors.push(`${v.id} : « ${alt} » ne se forme pas avec la banque (mot ${w})`);
        left.set(w, n - 1);
      }
    }

    if (!v.aRetenir.trim()) errors.push(`${v.id} : champ aRetenir vide`);
    if (rank.order >= 3 && !v.riposte) errors.push(`${v.id} : Riposte obligatoire à partir du rang 3`);
    if (rank.order < 3 && v.riposte) errors.push(`${v.id} : pas de Riposte aux rangs 1 et 2`);
    if (v.riposte) {
      if (v.riposte.options.filter((o) => o.correct).length !== 1) errors.push(`${v.id} : une seule bonne réponse attendue`);
      for (const o of v.riposte.options) {
        if (o.blame) checkElement(v.id, o.blame);
        if (!o.correct && !o.blame) errors.push(`${v.id} : option fausse sans élément fautif`);
      }
    }
    v.pivotElements.forEach((el) => checkElement(v.id, el));
  }
});

// La Stèle n'utilise que des briques existantes.
const known = new Set(bricks.map((b) => b.en.toLowerCase()));
const stele = tier.stele.en.toLowerCase().replace(/thank you/g, 'thank-you');
for (const w of words(stele)) {
  if (!known.has(w.replace('thank-you', 'thank you'))) errors.push(`Stèle : mot hors palier ${w}`);
}
if (!stele.includes('anna')) errors.push('Stèle : la signature d\'Anna manque');

// Règle 6 : chaque clip nécessaire existe (ignorée avec --no-audio, avant la génération).
if (!process.argv.includes('--no-audio')) {
  const manifestPath = 'src/audio/audio-manifest.ts';
  const manifest = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : '';
  for (const clip of listClips(content)) {
    if (!manifest.includes(JSON.stringify(clip.clipId))) errors.push(`Clip absent du manifeste : ${clip.clipId}`);
  }
}

if (errors.length) {
  console.error(`check-content : ${errors.length} erreur(s)\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
const variantCount = boss.ranks.reduce((n, r) => n + r.variants.length, 0);
console.log(
  `check-content : OK (${bricks.length} briques, ${sentences.length} phrases, ${formulas.length} formules, ${traps.length} pièges, ${exercises.length} exercices rédigés, ${variantCount} variantes de boss)`,
);
