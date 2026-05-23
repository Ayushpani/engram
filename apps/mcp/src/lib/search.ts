// apps/mcp/src/lib/search.ts
// Integration of Memory Consolidation clusters into the search pipeline

export interface SearchOptions {
  includeSummaries?: boolean;
}

export interface ClusterSummary {
  id: string;
  summary: string;
  sourceMemoryIds: string[];
}

export interface MemoryEntry {
  id: string;
  memory: string;
  isLatest: boolean;
  isInference: boolean;
  score?: number;
}

/**
 * Enriches search results with high-level cluster summaries.
 * If a matching memory belongs to a consolidated cluster, the cluster summary
 * is returned alongside the top specific memories to provide macro/micro context.
 */
export async function enrichWithClusterSummaries(
  results: MemoryEntry[],
  spaceId: string,
  options: SearchOptions,
  db: any // Mock DB client for this implementation
): Promise<{ summaries: ClusterSummary[], memories: MemoryEntry[] }> {
  
  if (!options.includeSummaries || results.length === 0) {
    return { summaries: [], memories: results };
  }

  // 1. Identify which returned memories belong to consolidated clusters
  const resultIds = results.map(r => r.id);
  
  // In a real implementation, this would be a DB query joining the relations table
  // e.g., SELECT parent_id, summary FROM memory_relations WHERE child_id IN (...) AND relation='derives'
  const relatedClusters = await db.getClustersForMemories(spaceId, resultIds);
  
  // 2. Deduplicate clusters (multiple results might belong to the same cluster)
  const uniqueClusters = new Map<string, ClusterSummary>();
  
  for (const cluster of relatedClusters) {
    if (!uniqueClusters.has(cluster.id)) {
      uniqueClusters.set(cluster.id, cluster);
    }
  }
  
  // 3. Return the combined macro context (summaries) and micro context (original top K results)
  return {
    summaries: Array.from(uniqueClusters.values()),
    memories: results
  };
}
