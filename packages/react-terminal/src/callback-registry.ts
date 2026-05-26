export function createCallbackRegistry<V>() {
  const map = new Map<string, { value: V; token: symbol }>();

  function register(key: string, value: V): () => void {
    const token = Symbol();
    map.set(key, { value, token });
    return function dispose() {
      if (map.get(key)?.token === token) map.delete(key);
    };
  }

  function unregister(key: string): void {
    map.delete(key);
  }

  function get(key: string): V | undefined {
    return map.get(key)?.value;
  }

  function getAll(): Map<string, V> {
    const out = new Map<string, V>();
    for (const [key, entry] of map) out.set(key, entry.value);
    return out;
  }

  function clear(): void {
    map.clear();
  }

  return { register, unregister, get, getAll, clear };
}
