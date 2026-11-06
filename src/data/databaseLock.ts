// Sur le web, SQLite ne peut s'ouvrir que dans un onglet à la fois : dans un second, l'ouverture ne répond jamais.
// On attend donc son tour avec un verrou du navigateur, libéré à la fermeture de l'onglet qui le détient.
// Sur téléphone en natif, ce verrou n'existe pas et n'est pas nécessaire.
const LOCK_NAME = 'le-dechiffreur:database';

type Holder = (lock: unknown) => Promise<void> | void;

export interface LockManagerLike {
  request(name: string, callback: Holder): Promise<unknown>;
  request(name: string, options: { ifAvailable: boolean }, callback: Holder): Promise<unknown>;
}

export function createDatabaseLock(locks: LockManagerLike | undefined) {
  let busy = false;
  let acquired: Promise<void> | null = null;
  const listeners = new Set<(busy: boolean) => void>();
  const setBusy = (value: boolean) => {
    busy = value;
    listeners.forEach((listener) => listener(value));
  };

  return {
    /** Résout quand cet onglet peut ouvrir la base. Le verrou reste détenu tant que l'onglet vit. */
    acquire(): Promise<void> {
      if (!locks) return Promise.resolve();
      acquired ??= new Promise<void>((resolve, reject) => {
        const hold = () => {
          setBusy(false);
          resolve();
          return new Promise<void>(() => undefined);
        };
        locks
          .request(LOCK_NAME, { ifAvailable: true }, (lock) => {
            if (lock) return hold();
            setBusy(true);
            locks.request(LOCK_NAME, hold).catch(reject);
          })
          .catch(reject);
      });
      return acquired;
    },
    /** Prévient quand un autre onglet détient la base, et quand elle se libère. */
    subscribe(listener: (busy: boolean) => void): () => void {
      listeners.add(listener);
      listener(busy);
      return () => listeners.delete(listener);
    },
  };
}

export const databaseLock = createDatabaseLock((globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks);
