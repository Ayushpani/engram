// packages/memory-consolidator/src/consolidation-worker.ts

import { ClusterResult, detect_clusters } from '../pkg/memory_consolidator.js';

export interface MemoryEntry {
  id: string;
  memory: string;
  embedding: number[];
  isLatest: boolean;
  isForgotten: boolean;
  updatedAt: string;
}

export interface Cluster {
  id: string;
  member_ids: string[];
}

export interface ConsolidationResult {
  summary: string;
  confidence: number;
  factCount: number;
  sourceMemoryIds: string[];
  autoCommitted: boolean;
  conflicts: string[];
}

export interface LLMClient {
  generate(prompt: string): Promise<string>;
}

export interface DBClient {
  getLastConsolidationTimestamp(spaceId: string): Promise<string>;
  getMemoriesUpdatedSince(spaceId: string, timestamp: string): Promise<MemoryEntry[]>;
  getExistingClusterCentroids(spaceId: string): Promise<MemoryEntry[]>;
  commitConsolidation(result: ConsolidationResult): Promise<void>;
}

export async function consolidateCluster(
  cluster: Cluster, 
  memories: MemoryEntry[],
  llm: LLMClient
): Promise<ConsolidationResult> {
  const sourceMemories = memories.filter(m => cluster.member_ids.includes(m.id));
  
  const prompt = `You are consolidating ${sourceMemories.length} related memories into a single coherent summary.

## Source Memories
${sourceMemories.map((m, i) => `${i+1}. ${m.memory}`).join('\n')}

## Instructions
1. Merge all non-contradictory facts into a single, coherent paragraph.
2. If any facts contradict each other, keep the MOST RECENT version and note the conflict.
3. Do NOT invent facts not present in the sources.
4. Rate your confidence that this summary accurately captures ALL source facts (0.0–1.0).

## Output (JSON)
{ "summary": "...", "confidence": 0.0, "factCount": 0, "conflicts": [] }`;

  try {
    const resultStr = await llm.generate(prompt);
    // basic parsing extraction in case of markdown blocks
    const jsonStr = resultStr.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    
    // CONFIDENCE GATE: Only commit high-confidence summaries
    if (parsed.confidence < 0.85) {
      console.warn(`Low confidence (${parsed.confidence}) for cluster ${cluster.id}, skipping auto-commit`);
      return { 
        ...parsed, 
        sourceMemoryIds: cluster.member_ids, 
        autoCommitted: false 
      };
    }
    
    return { 
      ...parsed, 
      sourceMemoryIds: cluster.member_ids, 
      autoCommitted: true 
    };
  } catch (error) {
    console.error(`LLM Summarization failed for cluster ${cluster.id}`, error);
    return {
      summary: "",
      confidence: 0,
      factCount: 0,
      conflicts: [],
      sourceMemoryIds: cluster.member_ids,
      autoCommitted: false
    };
  }
}

/**
 * Incremental Delta-Based Clustering
 */
export async function incrementalConsolidate(spaceId: string, db: DBClient, llm: LLMClient) {
  const lastRun = await db.getLastConsolidationTimestamp(spaceId);
  
  // Only fetch memories created/updated since last consolidation
  const newMemories = await db.getMemoriesUpdatedSince(spaceId, lastRun);
  
  if (newMemories.length < 5) return; // Not enough new memories to justify clustering overhead
  
  // Fetch existing cluster summaries to check for overlap with new memories
  const existingClusters = await db.getExistingClusterCentroids(spaceId);
  const allMemoriesToProcess = [...newMemories, ...existingClusters];
  
  const memoryIds = allMemoriesToProcess.map(m => m.id);
  const embeddings = new Float32Array(allMemoriesToProcess.length * 384);
  allMemoriesToProcess.forEach((m, i) => {
    embeddings.set(m.embedding, i * 384);
  });
  
  // Run WASM clustering on new memories + existing cluster centroids
  const resultJson = detect_clusters(
    JSON.stringify(memoryIds),
    embeddings,
    384,
    0.85
  );
  
  const result = JSON.parse(resultJson) as ClusterResult;
  
  // Only re-summarize clusters that include new memories
  for (const cluster of result.clusters) {
    const hasNewMembers = cluster.member_ids.some(id => 
      newMemories.some(m => m.id === id)
    );
    
    if (hasNewMembers) {
      const consolidationResult = await consolidateCluster(cluster, allMemoriesToProcess, llm);
      if (consolidationResult.autoCommitted) {
        await db.commitConsolidation(consolidationResult);
      }
    }
  }
}
