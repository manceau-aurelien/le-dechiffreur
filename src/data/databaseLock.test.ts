import { createDatabaseLock, type LockManagerLike } from './databaseLock';

/** Un gestionnaire de verrous minimal : une file, comme celui des navigateurs. */
function fakeLocks() {
  let held = false;
  const queue: (() => void)[] = [];
  const grant = (callback: (lock: unknown) => unknown) => {
    held = true;
    return Promise.resolve(callback({})).then(() => {
      held = false;
      queue.shift()?.();
    });
  };
  const request = (name: string, a: unknown, b?: unknown) => {
    const callback = (b ?? a) as (lock: unknown) => unknown;
    const ifAvailable = !!b && (a as { ifAvailable: boolean }).ifAvailable;
    if (!held) return grant(callback);
    if (ifAvailable) return Promise.resolve(callback(null));
    return new Promise<void>((resolve) => queue.push(() => void grant(callback).then(resolve)));
  };
  return {
    manager: { request } as unknown as LockManagerLike,
    /** Simule la fermeture de l'onglet qui détient le verrou. */
    closeHolder() {
      held = false;
      queue.shift()?.();
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('accès à la base entre onglets', () => {
  it('ouvre tout de suite sans verrou disponible, comme en natif', async () => {
    const seen: boolean[] = [];
    const lock = createDatabaseLock(undefined);
    lock.subscribe((busy) => seen.push(busy));
    await expect(lock.acquire()).resolves.toBeUndefined();
    expect(seen).toEqual([false]);
  });

  it('ouvre tout de suite quand aucun autre onglet ne tient la base', async () => {
    const seen: boolean[] = [];
    const lock = createDatabaseLock(fakeLocks().manager);
    lock.subscribe((busy) => seen.push(busy));
    await lock.acquire();
    expect(seen.includes(true)).toBe(false);
  });

  it('prévient le second onglet, puis reprend seul quand le premier se ferme', async () => {
    const { manager, closeHolder } = fakeLocks();
    await createDatabaseLock(manager).acquire();

    const second = createDatabaseLock(manager);
    const seen: boolean[] = [];
    second.subscribe((busy) => seen.push(busy));
    let opened = false;
    void second.acquire().then(() => (opened = true));
    await flush();
    expect(seen).toEqual([false, true]);
    expect(opened).toBe(false);

    closeHolder();
    await flush();
    expect(opened).toBe(true);
    expect(seen).toEqual([false, true, false]);
  });

  it('ne demande le verrou qu’une fois, même appelé plusieurs fois', async () => {
    const { manager } = fakeLocks();
    const request = jest.spyOn(manager, 'request');
    const lock = createDatabaseLock(manager);
    await Promise.all([lock.acquire(), lock.acquire()]);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
