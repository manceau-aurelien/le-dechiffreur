// La progression dans SQLite (§5.3). La base reste la source de vérité ; l'interface lit un instantané en mémoire.
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { BossState } from '../core/boss/engine';
import { emptyProgress, type ProgressSnapshot } from '../core/progress/progress';
import type { ReviewLogEntry, SrsCard } from '../core/srs/types';
import { databaseLock } from './databaseLock';

const MIGRATIONS: string[] = [
  `
  CREATE TABLE profile (id INTEGER PRIMARY KEY CHECK (id = 1), created_at INTEGER NOT NULL, content_version TEXT NOT NULL, settings_json TEXT NOT NULL);
  CREATE TABLE node_progress (node_id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL, started_at INTEGER, completed_at INTEGER, attempts INTEGER NOT NULL);
  CREATE TABLE brick_intro (brick_id TEXT PRIMARY KEY NOT NULL, presented_at INTEGER, first_correct_at INTEGER);
  CREATE TABLE srs_card (
    element_id TEXT PRIMARY KEY NOT NULL, element_type TEXT NOT NULL, fsrs_state_json TEXT NOT NULL,
    stability REAL NOT NULL, difficulty REAL NOT NULL, last_review_at INTEGER NOT NULL, due_at INTEGER NOT NULL,
    reps INTEGER NOT NULL, lapses INTEGER NOT NULL, distinct_success_days INTEGER NOT NULL, last_success_day INTEGER,
    listen_ok INTEGER NOT NULL, listen_total INTEGER NOT NULL, last_wrong INTEGER NOT NULL, last_from_boss INTEGER NOT NULL,
    recent_refs_json TEXT NOT NULL
  );
  CREATE INDEX idx_card_due ON srs_card (due_at);
  CREATE TABLE review_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, session_id TEXT, element_id TEXT NOT NULL,
    exercise_ref TEXT NOT NULL, exercise_type TEXT NOT NULL, rating TEXT NOT NULL, correct INTEGER NOT NULL,
    answer_raw TEXT NOT NULL, response_ms INTEGER, replays INTEGER NOT NULL, r_before REAL, s_before REAL, s_after REAL NOT NULL, source TEXT NOT NULL
  );
  CREATE INDEX idx_log_element ON review_log (element_id, ts);
  CREATE TABLE session (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER, planned_json TEXT NOT NULL, done_count INTEGER NOT NULL);
  CREATE TABLE boss_attempt (
    id TEXT PRIMARY KEY NOT NULL, boss_id TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER, outcome TEXT,
    errors INTEGER NOT NULL, slow_used INTEGER NOT NULL, current_rank INTEGER NOT NULL, drawn_json TEXT NOT NULL, state_json TEXT NOT NULL
  );
  CREATE INDEX idx_attempt ON boss_attempt (boss_id, started_at);
  CREATE TABLE boss_round (
    attempt_id TEXT NOT NULL, rank INTEGER NOT NULL, variant_id TEXT NOT NULL, placed_json TEXT NOT NULL, riposte_choice INTEGER,
    replays INTEGER NOT NULL, slow_used INTEGER NOT NULL, outcome TEXT NOT NULL, PRIMARY KEY (attempt_id, rank)
  );
  CREATE TABLE event_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, name TEXT NOT NULL, payload_json TEXT NOT NULL);
  `,
];

const CONTENT_VERSION = 'tier-01:1';

export interface BossSummary {
  lastDrawn: string[];
  attempts: number;
  defeatsInARow: number;
  resumable: { attemptId: string; state: BossState } | null;
}

export interface ProgressRepository {
  load(): Promise<ProgressSnapshot>;
  saveChange(prev: ProgressSnapshot, next: ProgressSnapshot, logs: ReviewLogEntry[]): Promise<void>;
  reset(): Promise<void>;
  startSession(id: string, kind: string, plannedJson: string, now: number): Promise<void>;
  endSession(id: string, doneCount: number, now: number): Promise<void>;
  saveBossAttempt(id: string, bossId: string, state: BossState, startedAt: number, now: number): Promise<void>;
  bossSummary(bossId: string): Promise<BossSummary>;
}

interface CardRow {
  element_id: string;
  element_type: SrsCard['elementType'];
  fsrs_state_json: string;
  stability: number;
  difficulty: number;
  last_review_at: number;
  due_at: number;
  reps: number;
  lapses: number;
  distinct_success_days: number;
  last_success_day: number | null;
  listen_ok: number;
  listen_total: number;
  last_wrong: number;
  last_from_boss: number;
  recent_refs_json: string;
}

function rowToCard(r: CardRow): SrsCard {
  return {
    elementId: r.element_id,
    elementType: r.element_type,
    state: JSON.parse(r.fsrs_state_json),
    stability: r.stability,
    difficulty: r.difficulty,
    lastReviewAt: r.last_review_at,
    dueAt: r.due_at,
    reps: r.reps,
    lapses: r.lapses,
    distinctSuccessDays: r.distinct_success_days,
    lastSuccessDay: r.last_success_day,
    listenOk: r.listen_ok,
    listenTotal: r.listen_total,
    lastWrong: !!r.last_wrong,
    lastFromBoss: !!r.last_from_boss,
    recentRefs: JSON.parse(r.recent_refs_json),
  };
}

const outcomeOf = (s: BossState) => (s.stage === 'won' ? 'win' : s.stage === 'lost' ? 'loss' : s.stage === 'abandoned' ? 'abandon' : null);

class SqliteRepository implements ProgressRepository {
  private db: Promise<SQLiteDatabase> | null = null;
  // SQLite ne permet qu'une transaction à la fois : les écritures passent l'une après l'autre.
  private queue: Promise<unknown> = Promise.resolve();

  private open(): Promise<SQLiteDatabase> {
    this.db ??= (async () => {
      await databaseLock.acquire();
      const db = await openDatabaseAsync('dechiffreur.db');
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      const version = row?.user_version ?? 0;
      for (let v = version; v < MIGRATIONS.length; v++) {
        await db.execAsync(MIGRATIONS[v]);
        await db.execAsync(`PRAGMA user_version = ${v + 1}`);
      }
      return db;
    })();
    return this.db;
  }

  private write<T>(work: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => work(await this.open()));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async load(): Promise<ProgressSnapshot> {
    const db = await this.open();
    const p = emptyProgress();
    const profile = await db.getFirstAsync<{ settings_json: string }>('SELECT settings_json FROM profile WHERE id = 1');
    if (profile) Object.assign(p, JSON.parse(profile.settings_json));
    for (const n of await db.getAllAsync<{ node_id: string; status: 'in_progress' | 'completed'; completed_at: number | null; attempts: number }>('SELECT * FROM node_progress')) {
      p.nodes[n.node_id] = { status: n.status, attempts: n.attempts, ...(n.completed_at ? { completedAt: n.completed_at } : {}) };
    }
    for (const b of await db.getAllAsync<{ brick_id: string; presented_at: number | null; first_correct_at: number | null }>('SELECT * FROM brick_intro')) {
      p.bricks[b.brick_id] = { ...(b.presented_at ? { presentedAt: b.presented_at } : {}), ...(b.first_correct_at ? { firstCorrectAt: b.first_correct_at } : {}) };
    }
    for (const c of await db.getAllAsync<CardRow>('SELECT * FROM srs_card')) p.cards[c.element_id] = rowToCard(c);
    return p;
  }

  /** Écrit seulement ce qui a changé, dans une seule transaction : une réponse est enregistrée entière ou pas du tout. */
  saveChange(prev: ProgressSnapshot, next: ProgressSnapshot, logs: ReviewLogEntry[]): Promise<void> {
    return this.write((db) =>
      db.withTransactionAsync(async () => {
        const settingsChanged =
          prev.devUnlockAll !== next.devUnlockAll || prev.bossOpened !== next.bossOpened || prev.clockOffsetMs !== next.clockOffsetMs || prev.onboarded !== next.onboarded;
        if (settingsChanged) {
          const settings = JSON.stringify({ devUnlockAll: next.devUnlockAll, bossOpened: next.bossOpened, clockOffsetMs: next.clockOffsetMs, onboarded: next.onboarded });
          await db.runAsync(
            'INSERT INTO profile (id, created_at, content_version, settings_json) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET settings_json = excluded.settings_json',
            Date.now(),
            CONTENT_VERSION,
            settings,
          );
        }
        for (const [id, n] of Object.entries(next.nodes)) {
          if (prev.nodes[id] === n) continue;
          await db.runAsync(
            'INSERT OR REPLACE INTO node_progress (node_id, status, started_at, completed_at, attempts) VALUES (?, ?, NULL, ?, ?)',
            id,
            n.status,
            n.completedAt ?? null,
            n.attempts,
          );
        }
        for (const [id, b] of Object.entries(next.bricks)) {
          if (prev.bricks[id] === b) continue;
          await db.runAsync('INSERT OR REPLACE INTO brick_intro (brick_id, presented_at, first_correct_at) VALUES (?, ?, ?)', id, b.presentedAt ?? null, b.firstCorrectAt ?? null);
        }
        for (const [id, c] of Object.entries(next.cards)) {
          if (prev.cards[id] === c) continue;
          await db.runAsync(
            'INSERT OR REPLACE INTO srs_card VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            id,
            c.elementType,
            JSON.stringify(c.state),
            c.stability,
            c.difficulty,
            c.lastReviewAt,
            c.dueAt,
            c.reps,
            c.lapses,
            c.distinctSuccessDays,
            c.lastSuccessDay,
            c.listenOk,
            c.listenTotal,
            c.lastWrong ? 1 : 0,
            c.lastFromBoss ? 1 : 0,
            JSON.stringify(c.recentRefs),
          );
        }
        for (const l of logs) {
          await db.runAsync(
            'INSERT INTO review_log (ts, session_id, element_id, exercise_ref, exercise_type, rating, correct, answer_raw, response_ms, replays, r_before, s_before, s_after, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            l.ts,
            l.sessionId,
            l.elementId,
            l.exerciseRef,
            l.exerciseType,
            l.rating,
            l.correct ? 1 : 0,
            l.answerRaw,
            l.responseMs,
            l.replays,
            l.rBefore,
            l.sBefore,
            l.sAfter,
            l.source,
          );
        }
      }),
    );
  }

  reset(): Promise<void> {
    return this.write((db) =>
      db.execAsync('DELETE FROM profile; DELETE FROM node_progress; DELETE FROM brick_intro; DELETE FROM srs_card; DELETE FROM review_log; DELETE FROM session; DELETE FROM boss_attempt; DELETE FROM boss_round; DELETE FROM event_log;'),
    );
  }

  startSession(id: string, kind: string, plannedJson: string, now: number): Promise<void> {
    return this.write(async (db) => {
      await db.runAsync('INSERT OR REPLACE INTO session (id, kind, started_at, ended_at, planned_json, done_count) VALUES (?, ?, ?, NULL, ?, 0)', id, kind, now, plannedJson);
    });
  }

  endSession(id: string, doneCount: number, now: number): Promise<void> {
    return this.write(async (db) => {
      await db.runAsync('UPDATE session SET ended_at = ?, done_count = ? WHERE id = ?', now, doneCount, id);
    });
  }

  /** Enregistre le combat à chaque changement : il reprend même si l'application a été fermée. */
  saveBossAttempt(id: string, bossId: string, state: BossState, startedAt: number, now: number): Promise<void> {
    return this.write((db) =>
      db.withTransactionAsync(async () => {
        const outcome = outcomeOf(state);
        const slowUsed = state.results.reduce((sum, r) => sum + r.slowUsed, 0);
        await db.runAsync(
          'INSERT OR REPLACE INTO boss_attempt (id, boss_id, started_at, ended_at, outcome, errors, slow_used, current_rank, drawn_json, state_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          id,
          bossId,
          startedAt,
          outcome ? now : null,
          outcome,
          state.errors,
          slowUsed,
          state.rounds[state.index].rank,
          JSON.stringify(state.rounds.map((r) => r.variant.id)),
          JSON.stringify(state),
        );
        for (const r of state.results) {
          await db.runAsync(
            'INSERT OR REPLACE INTO boss_round (attempt_id, rank, variant_id, placed_json, riposte_choice, replays, slow_used, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            id,
            r.rank,
            r.variant.id,
            JSON.stringify(r.placed),
            r.riposteChoice,
            r.replays,
            r.slowUsed,
            r.outcome,
          );
        }
      }),
    );
  }

  async bossSummary(bossId: string): Promise<BossSummary> {
    const db = await this.open();
    const rows = await db.getAllAsync<{ id: string; outcome: string | null; drawn_json: string; state_json: string }>(
      'SELECT id, outcome, drawn_json, state_json FROM boss_attempt WHERE boss_id = ? ORDER BY started_at DESC',
      bossId,
    );
    let defeatsInARow = 0;
    for (const r of rows) {
      if (r.outcome === 'loss') defeatsInARow++;
      else if (r.outcome === 'win') break;
    }
    const open = rows.find((r) => r.outcome === null);
    return {
      lastDrawn: rows[0] ? JSON.parse(rows[0].drawn_json) : [],
      attempts: rows.length,
      defeatsInARow,
      resumable: open ? { attemptId: open.id, state: JSON.parse(open.state_json) } : null,
    };
  }
}

export const repository: ProgressRepository = new SqliteRepository();
