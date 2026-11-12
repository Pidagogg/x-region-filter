// The small key-value storage the extension needs, shaped like storage.local,
// so store.ts doesn't care how it's backed (platform.ts). Nothing in it leaves
// the device.

export type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;

export interface KV {
  /** only the keys that exist come back, as with storage.local.get */
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  /** every change, from this page or another tab of the extension */
  onChanged(cb: (changes: Changes) => void): void;
}
