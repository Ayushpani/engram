use petgraph::graph::{NodeIndex, UnGraph};
use petgraph::visit::EdgeRef;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use std::collections::HashMap;
use wasm_math::cosine_similarity;

#[derive(Serialize, Deserialize)]
pub struct ClusterResult {
    pub clusters: Vec<Cluster>,
    pub overlaps: Vec<Overlap>,
}

#[derive(Serialize, Deserialize)]
pub struct Cluster {
    pub id: String,
    pub member_ids: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct Overlap {
    pub id_a: String,
    pub id_b: String,
    pub similarity: f32,
}

fn modularity_gain(
    graph: &UnGraph<usize, f32>,
    community: &[usize],
    node: usize,
    target_comm: usize,
    total_weight: f32,
    resolution: f32,
) -> f32 {
    let mut comm_weight_in = 0.0;
    let mut comm_tot_weight = 0.0;
    let mut node_comm_weight = 0.0;
    let mut node_degree = 0.0;
    
    // Calculate weights
    for edge in graph.edge_references() {
        let u = edge.source().index();
        let v = edge.target().index();
        let w = *edge.weight();
        
        let comm_u = community[u];
        let comm_v = community[v];
        
        if u == node {
            node_degree += w;
            if comm_v == target_comm {
                node_comm_weight += w;
            }
        } else if v == node {
            node_degree += w;
            if comm_u == target_comm {
                node_comm_weight += w;
            }
        }
        
        if comm_u == target_comm {
            comm_tot_weight += w;
            if comm_v == target_comm {
                comm_weight_in += w;
            }
        } else if comm_v == target_comm {
            comm_tot_weight += w;
        }
    }
    
    // Modularity gain formula:
    // \Delta Q = \left[ \frac{\Sigma_{in} + k_{i,in}}{2m} - \left( \frac{\Sigma_{tot} + k_i}{2m} \right)^2 \right] - \left[ \frac{\Sigma_{in}}{2m} - \left( \frac{\Sigma_{tot}}{2m} \right)^2 - \left( \frac{k_i}{2m} \right)^2 \right]
    // Simplified:
    
    let m2 = 2.0 * total_weight;
    if m2 == 0.0 {
        return 0.0;
    }
    
    let q_gain = (node_comm_weight - resolution * (comm_tot_weight * node_degree) / m2) / m2;
    q_gain
}

fn louvain_communities(graph: &UnGraph<usize, f32>, resolution: f32) -> Vec<usize> {
    let n = graph.node_count();
    let mut community: Vec<usize> = (0..n).collect();
    let total_weight: f32 = graph.edge_weights().sum();
    
    if total_weight == 0.0 {
        return community;
    }
    
    let mut improved = true;
    let mut passes = 0;
    let max_passes = 10;
    
    while improved && passes < max_passes {
        improved = false;
        passes += 1;
        
        for node in graph.node_indices() {
            let node_idx = node.index();
            let current_comm = community[node_idx];
            
            let mut best_comm = current_comm;
            let mut best_gain = 0.0_f32;
            
            // Only consider moving to communities of neighbors
            let mut neighbor_comms = std::collections::HashSet::new();
            for edge in graph.edges(node) {
                let neighbor_comm = community[edge.target().index()];
                neighbor_comms.insert(neighbor_comm);
            }
            
            for &target_comm in &neighbor_comms {
                if target_comm == current_comm {
                    continue;
                }
                
                let gain = modularity_gain(
                    graph, &community, node_idx, target_comm, total_weight, resolution
                );
                
                if gain > best_gain {
                    best_gain = gain;
                    best_comm = target_comm;
                }
            }
            
            if best_comm != current_comm {
                // Temporarily remove node from its old community (for the purpose of gain tracking, though our simple array handles it directly)
                community[node_idx] = best_comm;
                improved = true;
            }
        }
    }
    
    community
}

#[wasm_bindgen]
pub fn detect_clusters(
    memory_ids_json: &str,
    embeddings: &[f32],
    dimensions: usize,
    similarity_threshold: f32, // for overlap detection
) -> Result<JsValue, JsValue> {
    let memory_ids: Vec<String> = serde_json::from_str(memory_ids_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse memory IDs: {}", e)))?;

    let num_nodes = memory_ids.len();
    if embeddings.len() != num_nodes * dimensions {
        return Err(JsValue::from_str("Embeddings dimension mismatch"));
    }

    let mut graph = UnGraph::<usize, f32>::new_undirected();
    let mut node_indices = Vec::with_capacity(num_nodes);

    for i in 0..num_nodes {
        node_indices.push(graph.add_node(i));
    }

    let mut overlaps = Vec::new();

    // Compute pairwise similarity
    for i in 0..num_nodes {
        let vec_i = &embeddings[(i * dimensions)..((i + 1) * dimensions)];
        
        for j in (i + 1)..num_nodes {
            let vec_j = &embeddings[(j * dimensions)..((j + 1) * dimensions)];
            let sim = cosine_similarity(vec_i, vec_j);

            if sim > 0.65 { 
                graph.add_edge(node_indices[i], node_indices[j], sim);
            }
            
            if sim >= similarity_threshold {
                overlaps.push(Overlap {
                    id_a: memory_ids[i].clone(),
                    id_b: memory_ids[j].clone(),
                    similarity: sim,
                });
            }
        }
    }

    // Run Louvain Modularity
    let resolution = 1.0; 
    let community_assignments = louvain_communities(&graph, resolution);
    
    // Group into clusters
    let mut comm_map: HashMap<usize, Vec<String>> = HashMap::new();
    for (i, &comm) in community_assignments.iter().enumerate() {
        comm_map.entry(comm).or_default().push(memory_ids[i].clone());
    }
    
    let mut clusters = Vec::new();
    let mut cluster_count = 0;
    
    for (_, members) in comm_map {
        // Only consider clusters of >3 for summarization based on plan
        if members.len() > 3 {
            clusters.push(Cluster {
                id: format!("cluster_{}", cluster_count),
                member_ids: members,
            });
            cluster_count += 1;
        }
    }

    let result = ClusterResult {
        clusters,
        overlaps,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}
