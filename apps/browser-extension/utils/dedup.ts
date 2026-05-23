// apps/browser-extension/utils/dedup.ts

// @ts-ignore
import { init_embedder, embed_text, is_duplicate, DedupResult } from '../../../packages/client-dedup-wasm/pkg/client_dedup_wasm.js';

export interface CachedEmbedding {
  id: string;
  text: string;
  embedding: number[];
  timestamp: number;
}

const DEDUP_THRESHOLD = 0.95; // High threshold to prevent false positive deduplication
const MAX_CACHE_SIZE = 1000;

class LocalSemanticCache {
  private db: IDBDatabase | null = null;
  private initialized = false;

  async init() {
    if (this.initialized) return;

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('engram-semantic-cache', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('embeddings')) {
          db.createObjectStore('embeddings', { keyPath: 'id' });
        }
      };
    });
  }

  async getAll(): Promise<CachedEmbedding[]> {
    if (!this.db) throw new Error('DB not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['embeddings'], 'readonly');
      const store = transaction.objectStore('embeddings');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async save(embedding: CachedEmbedding): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['embeddings'], 'readwrite');
      const store = transaction.objectStore('embeddings');
      const request = store.put(embedding);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async cleanup(): Promise<void> {
    const all = await this.getAll();
    if (all.length <= MAX_CACHE_SIZE) return;
    
    // Sort by timestamp descending
    all.sort((a, b) => b.timestamp - a.timestamp);
    
    const toDelete = all.slice(MAX_CACHE_SIZE);
    
    for (const item of toDelete) {
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction(['embeddings'], 'readwrite');
        const store = transaction.objectStore('embeddings');
        const request = store.delete(item.id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }
}

const cache = new LocalSemanticCache();

export async function processAndDedupMemory(text: string, spaceId: string): Promise<{ shouldUpload: boolean, duplicateOf?: string }> {
  try {
    await cache.init();
    
    // In a real environment, we'd ensure WASM is loaded here
    // init_embedder(modelBytes, tokenizerBytes);
    
    const newEmbeddingArr = embed_text(text);
    const newEmbedding = new Float32Array(newEmbeddingArr);
    
    const cachedItems = await cache.getAll();
    
    if (cachedItems.length > 0) {
      const flatEmbeddings = new Float32Array(cachedItems.length * 384);
      cachedItems.forEach((item, i) => {
        flatEmbeddings.set(item.embedding, i * 384);
      });
      
      const resultJson = is_duplicate(
        newEmbedding, 
        flatEmbeddings, 
        cachedItems.length, 
        DEDUP_THRESHOLD
      );
      
      const result = JSON.parse(resultJson) as DedupResult;
      
      if (result.is_duplicate && result.most_similar_index !== undefined && result.most_similar_index !== null) {
        console.log(`Duplicate found. Sim: ${result.similarity}`);
        return { 
          shouldUpload: false, 
          duplicateOf: cachedItems[result.most_similar_index].id 
        };
      }
    }
    
    // Not a duplicate, save to cache
    const id = crypto.randomUUID();
    await cache.save({
      id,
      text,
      embedding: Array.from(newEmbeddingArr),
      timestamp: Date.now()
    });
    
    // Run cleanup asynchronously
    cache.cleanup().catch(console.error);
    
    return { shouldUpload: true };
  } catch (error) {
    console.error("Deduplication error, falling back to upload", error);
    return { shouldUpload: true };
  }
}
