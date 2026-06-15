use serde::{Deserialize, Serialize};

pub const ROOT_ID: u32 = 0;
pub const NO_PARENT: u32 = u32::MAX;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NodeType {
    Root,
    X,
    Y,
    Z,
    W,
    Q,
    R,
}

impl NodeType {
    pub fn from_str(s: &str) -> Self {
        match s {
            "X" => NodeType::X,
            "Y" => NodeType::Y,
            "Z" => NodeType::Z,
            "W" => NodeType::W,
            "Q" => NodeType::Q,
            "R" => NodeType::R,
            _ => NodeType::Root,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            NodeType::Root => "ROOT",
            NodeType::X => "X",
            NodeType::Y => "Y",
            NodeType::Z => "Z",
            NodeType::W => "W",
            NodeType::Q => "Q",
            NodeType::R => "R",
        }
    }
}

#[derive(Clone, Debug)]
pub struct NodeData {
    pub tipo: NodeType,
    pub valor: f64,
    pub multi: u32,
    pub children: Vec<u32>,
    pub parent: u32,
    pub label: Option<String>,
    pub transposed: bool,
}

/// Arena-based tree: all nodes stored in a flat Vec, referenced by u32 index.
/// Root is always at index 0.
#[derive(Clone, Debug)]
pub struct Arena {
    pub nodes: Vec<NodeData>,
}

impl Arena {
    pub fn new_root(w: f64) -> Self {
        Arena {
            nodes: vec![NodeData {
                tipo: NodeType::Root,
                valor: w,
                multi: 1,
                children: Vec::new(),
                parent: NO_PARENT,
                label: None,
                transposed: false,
            }],
        }
    }

    #[inline]
    pub fn get(&self, id: u32) -> &NodeData {
        &self.nodes[id as usize]
    }

    #[inline]
    pub fn get_mut(&mut self, id: u32) -> &mut NodeData {
        &mut self.nodes[id as usize]
    }

    /// Add a new node as child of parent_id, return new node's id.
    pub fn add_child(&mut self, parent_id: u32, tipo: NodeType, valor: f64, multi: u32) -> u32 {
        let new_id = self.nodes.len() as u32;
        self.nodes.push(NodeData {
            tipo,
            valor,
            multi,
            children: Vec::new(),
            parent: parent_id,
            label: None,
            transposed: false,
        });
        self.nodes[parent_id as usize].children.push(new_id);
        new_id
    }

    /// Remove a child from its parent's children list (does not remove from arena).
    pub fn detach(&mut self, node_id: u32) {
        let parent_id = self.nodes[node_id as usize].parent;
        if parent_id != NO_PARENT {
            self.nodes[parent_id as usize].children.retain(|&c| c != node_id);
        }
    }

    /// Walk up to find an ancestor of the given type.
    pub fn find_ancestor(&self, start: u32, tipo: &NodeType) -> Option<u32> {
        if self.nodes[start as usize].tipo == *tipo {
            return Some(start);
        }
        let mut cur = self.nodes[start as usize].parent;
        while cur != NO_PARENT {
            if self.nodes[cur as usize].tipo == *tipo {
                return Some(cur);
            }
            cur = self.nodes[cur as usize].parent;
        }
        None
    }

    pub fn root_children_ids(&self) -> Vec<u32> {
        self.nodes[ROOT_ID as usize].children.clone()
    }

    /// Serialize arena tree to JSON-compatible structure matching TypeScript TreeNode.
    pub fn to_json_node(&self, id: u32) -> TreeNodeJson {
        let n = &self.nodes[id as usize];
        let filhos = n.children.iter().map(|&c| self.to_json_node(c)).collect();
        TreeNodeJson {
            id: if id == ROOT_ID { "root".to_string() } else { format!("n{}", id) },
            tipo: n.tipo.as_str().to_string(),
            valor: n.valor,
            multi: n.multi,
            filhos,
            label: n.label.clone(),
            transposed: if n.transposed { Some(true) } else { None },
        }
    }

    /// Build Arena from a JSON TreeNode (for input parsing).
    pub fn from_json_node(json: &TreeNodeJson) -> Self {
        let mut arena = Arena {
            nodes: vec![NodeData {
                tipo: NodeType::from_str(&json.tipo),
                valor: json.valor,
                multi: json.multi,
                children: Vec::new(),
                parent: NO_PARENT,
                label: json.label.clone(),
                transposed: json.transposed.unwrap_or(false),
            }],
        };
        for child in &json.filhos {
            arena.add_child_recursive(ROOT_ID, child);
        }
        arena
    }

    fn add_child_recursive(&mut self, parent_id: u32, json: &TreeNodeJson) {
        let new_id = self.nodes.len() as u32;
        self.nodes.push(NodeData {
            tipo: NodeType::from_str(&json.tipo),
            valor: json.valor,
            multi: json.multi,
            children: Vec::new(),
            parent: parent_id,
            label: json.label.clone(),
            transposed: json.transposed.unwrap_or(false),
        });
        self.nodes[parent_id as usize].children.push(new_id);
        for child in &json.filhos {
            self.add_child_recursive(new_id, child);
        }
    }
}

/// JSON-compatible representation matching TypeScript TreeNode.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TreeNodeJson {
    pub id: String,
    pub tipo: String,
    pub valor: f64,
    pub multi: u32,
    pub filhos: Vec<TreeNodeJson>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transposed: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Piece {
    pub w: f64,
    pub h: f64,
    pub area: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<String>>,
    #[serde(rename = "groupedAxis", skip_serializing_if = "Option::is_none")]
    pub grouped_axis: Option<String>,
    #[serde(rename = "individualDims", skip_serializing_if = "Option::is_none")]
    pub individual_dims: Option<Vec<f64>>,
}

impl Piece {
    pub fn is_grouped(&self) -> bool {
        self.count.map(|c| c > 1).unwrap_or(false)
    }
    pub fn effective_count(&self) -> u32 {
        self.count.unwrap_or(1)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OptimizationProgress {
    pub phase: String,
    pub current: u32,
    pub total: u32,
    #[serde(rename = "bestUtil", skip_serializing_if = "Option::is_none")]
    pub best_util: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OptimizeV6Result {
    pub tree: TreeNodeJson,
    pub remaining: Vec<Piece>,
}
