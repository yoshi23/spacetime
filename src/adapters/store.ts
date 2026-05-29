import { get, set } from 'idb-keyval';
import type { Base, View } from '../core/types';

export interface PersistedState {
  base: Base;
  views: View[];
}

export interface Store {
  load(): Promise<PersistedState | null>;
  save(data: PersistedState): Promise<void>;
}

const KEY = 'spacetime/state/v1';

// IndexedDB-backed store via idb-keyval. The whole base+views blob is
// persisted under one key (single user, last-write-wins — see CLAUDE.md).
export class IndexedDBStore implements Store {
  private readonly key: string;

  constructor(key: string = KEY) {
    this.key = key;
  }

  async load(): Promise<PersistedState | null> {
    const data = await get<PersistedState>(this.key);
    return data ?? null;
  }

  async save(data: PersistedState): Promise<void> {
    await set(this.key, data);
  }
}
