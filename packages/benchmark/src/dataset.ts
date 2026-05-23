// src/dataset.ts
// Generates a synthetic ground truth dataset + adversarial test cases for benchmarking

export interface BenchmarkDocument {
  id: string;
  topic: string;
  title: string;
  content: string;
}

export interface BenchmarkMemory {
  id: string;
  documentId: string;
  memory: string;
  version: number;
  isLatest: boolean;
  parents: string[];
  createdAtTs?: number; // Unix timestamp for testing recency
  isCoreProfile?: boolean; // Flag for profile traits
  relationCount?: number; // Simulated graph centrality
}

export interface GroundTruthQuery {
  id: string;
  query: string;
  expectedMemoryIds: string[];
  type: "standard" | "adversarial_temporal" | "adversarial_near_miss" | "adversarial_contradiction" | "adversarial_profile" | "adversarial_recency";
}

export interface BenchmarkDataset {
  documents: BenchmarkDocument[];
  memories: BenchmarkMemory[];
  queries: GroundTruthQuery[];
}

// Simple deterministic random number generator for reproducibility
class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

export function generateDataset(numDocs: number, numQueries: number): BenchmarkDataset {
  const rng = new SeededRandom(42);
  const topics = ["tech", "cooking", "finance", "health", "travel", "music", "science", "personal"];
  
  const documents: BenchmarkDocument[] = [];
  const memories: BenchmarkMemory[] = [];
  const queries: GroundTruthQuery[] = [];
  
  const now = Date.now() / 1000;
  
  // 1. Generate Standard Documents and Memories
  for (let i = 0; i < numDocs; i++) {
    const topic = topics[Math.floor(rng.next() * topics.length)];
    const docId = `doc_${i}`;
    
    documents.push({
      id: docId,
      topic,
      title: `Article about ${topic} ${i}`,
      content: `This is a detailed article discussing various aspects of ${topic}. It covers fundamental concepts and advanced techniques relevant to document ${i}.`
    });
    
    // Generate 3-7 memories per document
    const numMemories = Math.floor(rng.next() * 5) + 3;
    let previousMemoryId: string | null = null;
    
    for (let j = 0; j < numMemories; j++) {
      const memId = `mem_${i}_${j}`;
      const isUpdate = j > 0 && rng.next() > 0.7;
      
      // Random age between now and 30 days ago
      const ageSeconds = rng.next() * 30 * 24 * 3600;
      
      const memory: BenchmarkMemory = {
        id: memId,
        documentId: docId,
        memory: `A specific fact about ${topic} extracted from document ${i}, fact number ${j}.`,
        version: isUpdate ? 2 : 1,
        isLatest: true,
        parents: isUpdate && previousMemoryId ? [previousMemoryId] : [],
        createdAtTs: now - ageSeconds,
        isCoreProfile: false,
        relationCount: Math.floor(rng.next() * 5),
      };
      
      if (isUpdate && previousMemoryId) {
        const prev = memories.find(m => m.id === previousMemoryId);
        if (prev) prev.isLatest = false;
      }
      
      memories.push(memory);
      previousMemoryId = memId;
    }
  }

  // 2. Inject Adversarial Test Cases
  const advDocId = `doc_adversarial`;
  documents.push({
    id: advDocId,
    topic: "adversarial",
    title: "Adversarial Contexts",
    content: "Content designed to trick the reranker and memory consolidator."
  });

  // A. Temporal Ordering (Same topic, different time)
  memories.push({
    id: `mem_adv_temp_old`, documentId: advDocId, memory: "I live in New York City.", version: 1, isLatest: true, parents: [], createdAtTs: now - (365 * 24 * 3600), isCoreProfile: false, relationCount: 1
  });
  memories.push({
    id: `mem_adv_temp_new`, documentId: advDocId, memory: "I moved to San Francisco.", version: 1, isLatest: true, parents: [], createdAtTs: now - (2 * 24 * 3600), isCoreProfile: false, relationCount: 1
  });
  queries.push({ id: "q_adv_temp", query: "Where do I live currently?", expectedMemoryIds: ["mem_adv_temp_new"], type: "adversarial_temporal" });

  // B. Near-Miss False Positive (Should NOT be deduplicated/merged)
  memories.push({
    id: `mem_adv_nearmiss_1`, documentId: advDocId, memory: "React hooks allow you to use state in functional components.", version: 1, isLatest: true, parents: [], createdAtTs: now, isCoreProfile: false, relationCount: 0
  });
  memories.push({
    id: `mem_adv_nearmiss_2`, documentId: advDocId, memory: "React Native hooks allow you to access native device APIs.", version: 1, isLatest: true, parents: [], createdAtTs: now, isCoreProfile: false, relationCount: 0
  });
  queries.push({ id: "q_adv_nearmiss", query: "How to use device APIs?", expectedMemoryIds: ["mem_adv_nearmiss_2"], type: "adversarial_near_miss" });

  // C. Contradiction Detection
  memories.push({
    id: `mem_adv_contra_1`, documentId: advDocId, memory: "I am severely allergic to peanuts.", version: 1, isLatest: true, parents: [], createdAtTs: now - 10000, isCoreProfile: true, relationCount: 5
  });
  memories.push({
    id: `mem_adv_contra_2`, documentId: advDocId, memory: "I love eating peanut butter sandwiches.", version: 1, isLatest: true, parents: [], createdAtTs: now - 5000, isCoreProfile: false, relationCount: 0
  });
  queries.push({ id: "q_adv_contra", query: "What should I eat?", expectedMemoryIds: ["mem_adv_contra_1"], type: "adversarial_contradiction" });

  // D. Profile Fact Boundary
  memories.push({
    id: `mem_adv_prof_1`, documentId: advDocId, memory: "My name is John Doe.", version: 1, isLatest: true, parents: [], createdAtTs: now - 100000, isCoreProfile: true, relationCount: 10
  });
  memories.push({
    id: `mem_adv_prof_2`, documentId: advDocId, memory: "John mentioned he was going to the store.", version: 1, isLatest: true, parents: [], createdAtTs: now - 100, isCoreProfile: false, relationCount: 0
  });
  queries.push({ id: "q_adv_prof", query: "What is my name?", expectedMemoryIds: ["mem_adv_prof_1"], type: "adversarial_profile" });

  // E. Recency Override (Old highly relevant vs New slightly relevant)
  memories.push({
    id: `mem_adv_recency_old`, documentId: advDocId, memory: "The exact formula for quantum entanglement is...", version: 1, isLatest: true, parents: [], createdAtTs: now - (400 * 24 * 3600), isCoreProfile: false, relationCount: 0
  });
  memories.push({
    id: `mem_adv_recency_new`, documentId: advDocId, memory: "I watched a sci-fi movie about quantum entanglement today.", version: 1, isLatest: true, parents: [], createdAtTs: now - 10, isCoreProfile: false, relationCount: 0
  });
  queries.push({ id: "q_adv_recency", query: "What is the formula for quantum entanglement?", expectedMemoryIds: ["mem_adv_recency_old"], type: "adversarial_recency" });

  // 3. Generate Standard Queries
  for (let i = 0; i < numQueries; i++) {
    const topic = topics[Math.floor(rng.next() * topics.length)];
    const matchingDocs = documents.filter(d => d.topic === topic);
    const expectedMemories = memories.filter(m => 
      m.isLatest && matchingDocs.some(d => d.id === m.documentId) && !m.id.startsWith('mem_adv_')
    );
    
    const selectedExpected = expectedMemories
      .sort(() => rng.next() - 0.5)
      .slice(0, 5)
      .map(m => m.id);

    queries.push({
      id: `q_std_${i}`,
      query: `Tell me about ${topic} concepts`,
      expectedMemoryIds: selectedExpected,
      type: "standard"
    });
  }

  return { documents, memories, queries };
}
