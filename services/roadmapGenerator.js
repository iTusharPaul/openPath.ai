const { pool } = require("../db/db");

const {
  calculateGlossaryLoad,
  calculateActiveIndegree,
  calculateRelativeDepth,
  calculateICF,
  calculateWeights,
  validatePathFeasibility,
  allocateTime,
  distributeConcepts
} = require("../utils/timePlanner");

// Map level → Phase
function getPhase(level) {
  if (level == 1) return "Foundations";
  if (level == 2) return "Linear Data Structures";
  if (level == 3) return "Hashing & Heaps";
  if (level == 4) return "Trees";
  if (level == 5) return "Graphs";
  return "Other";
}

// Stable Topological Sort
function topoSort(concepts, edges) {
  const graph = {};
  const indegree = {};

  concepts.forEach(c => {
    graph[c.id] = [];
    indegree[c.id] = 0;
  });

  edges.forEach(e => {
    if (graph[e.prerequisite_id]) {
      graph[e.prerequisite_id].push(e.concept_id);
      indegree[e.concept_id]++;
    }
  });

  const queue = [];
  for (let node in indegree) {
    if (indegree[node] == 0) queue.push(parseInt(node));
  }

  const topoOrder = [];

  while (queue.length) {
    queue.sort((a, b) => a - b);
    const node = queue.shift();
    topoOrder.push(node);

    for (let neighbor of graph[node] || []) {
      indegree[neighbor]--;
      if (indegree[neighbor] == 0) {
        queue.push(neighbor);
      }
    }
  }

  const topoIndex = {};
  topoOrder.forEach((id, index) => {
    topoIndex[id] = index;
  });

  return topoIndex;
}

function sanitizeRoadmapName(rawName) {
  const value = String(rawName || "").trim();
  if (!value) return "Untitled Roadmap";
  return value.slice(0, 120);
}

function normalizeCompletedConcepts(progressPayload) {
  const ids = Array.isArray(progressPayload?.completed_concepts)
    ? progressPayload.completed_concepts
    : [];

  return [...new Set(
    ids
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && id > 0)
  )];
}

function mapRoadmapRow(row) {
  const completedConcepts = normalizeCompletedConcepts(row.progress_payload);
  return {
    roadmap_id: row.id,
    roadmap_name: row.roadmap_name,
    ...row.result_payload,
    saved_at: row.created_at,
    input_payload: row.input_payload,
    progress_payload: { completed_concepts: completedConcepts }
  };
}

function buildRoadmapSummaryFromRow(row) {
  const roadmapWeeks = Array.isArray(row.result_payload?.roadmap) ? row.result_payload.roadmap : [];
  let scheduledWeeks = 0;
  let assignedConcepts = 0;

  for (const week of roadmapWeeks) {
    const concepts = Array.isArray(week?.concepts) ? week.concepts : [];
    const eligibleConcepts = new Set();

    for (const concept of concepts) {
      const conceptId = Number.parseInt(concept?.concept_id, 10);
      const allocated = Number(concept?.allocated_time || 0);
      const base = Number(concept?.allocated_base_time || 0);
      const buffer = Number(concept?.allocated_buffer_time || 0);
      const total = Math.max(allocated, base + buffer);
      if (Number.isFinite(conceptId) && conceptId > 0 && total > 0) {
        eligibleConcepts.add(conceptId);
      }
    }

    if (eligibleConcepts.size > 0) {
      scheduledWeeks += 1;
      assignedConcepts += eligibleConcepts.size;
    }
  }

  const completedConcepts = normalizeCompletedConcepts(row.progress_payload);
  const completedCount = completedConcepts.filter((id) => {
    return roadmapWeeks.some((week) => {
      const concepts = Array.isArray(week?.concepts) ? week.concepts : [];
      return concepts.some((concept) => {
        const conceptId = Number.parseInt(concept?.concept_id, 10);
        const allocated = Number(concept?.allocated_time || 0);
        const base = Number(concept?.allocated_base_time || 0);
        const buffer = Number(concept?.allocated_buffer_time || 0);
        const total = Math.max(allocated, base + buffer);
        return conceptId === id && total > 0;
      });
    });
  }).length;

  const completionPercent = assignedConcepts > 0
    ? Math.round((completedCount / assignedConcepts) * 100)
    : 0;

  return {
    roadmap_id: row.id,
    roadmap_name: row.roadmap_name,
    saved_at: row.created_at,
    total_concepts: Number.parseInt(row.result_payload?.total_concepts || 0, 10) || 0,
    scheduled_weeks: scheduledWeeks,
    completion: {
      completed_concepts: completedCount,
      total_concepts: assignedConcepts,
      percent: completionPercent
    }
  };
}

async function persistRoadmapForUser(userId, roadmapName, userInput, result) {
  const insertResult = await pool.query(
    `INSERT INTO roadmaps (user_id, roadmap_name, input_payload, result_payload, progress_payload)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, '{"completed_concepts": []}'::jsonb)
     RETURNING id, roadmap_name, input_payload, result_payload, progress_payload, created_at`,
    [userId, sanitizeRoadmapName(roadmapName), JSON.stringify(userInput), JSON.stringify(result)]
  );

  return mapRoadmapRow(insertResult.rows[0]);
}

async function getLatestRoadmapForUser(userId) {
  const result = await pool.query(
    `SELECT id, roadmap_name, input_payload, result_payload, progress_payload, created_at
     FROM roadmaps
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapRoadmapRow(result.rows[0]);
}

async function listRoadmapsForUser(userId) {
  const result = await pool.query(
    `SELECT id, roadmap_name, input_payload, result_payload, progress_payload, created_at
     FROM roadmaps
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId]
  );

  return result.rows.map(buildRoadmapSummaryFromRow);
}

async function getRoadmapForUser(userId, roadmapId) {
  const id = Number.parseInt(roadmapId, 10);
  if (!Number.isFinite(id) || id <= 0) return null;

  const result = await pool.query(
    `SELECT id, roadmap_name, input_payload, result_payload, progress_payload, created_at
     FROM roadmaps
     WHERE user_id = $1 AND id = $2
     LIMIT 1`,
    [userId, id]
  );

  if (result.rowCount === 0) return null;
  return mapRoadmapRow(result.rows[0]);
}

async function updateRoadmapProgressForUser(userId, roadmapId, completedConceptIds) {
  const id = Number.parseInt(roadmapId, 10);
  if (!Number.isFinite(id) || id <= 0) return null;

  const normalized = [...new Set(
    (Array.isArray(completedConceptIds) ? completedConceptIds : [])
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value > 0)
  )];

  const result = await pool.query(
    `UPDATE roadmaps
     SET progress_payload = jsonb_build_object('completed_concepts', $3::int[])
     WHERE user_id = $1 AND id = $2
     RETURNING id, roadmap_name, input_payload, result_payload, progress_payload, created_at`,
    [userId, id, normalized]
  );

  if (result.rowCount === 0) return null;
  return mapRoadmapRow(result.rows[0]);
}

async function deleteRoadmapForUser(userId, roadmapId) {
  const id = Number.parseInt(roadmapId, 10);
  if (!Number.isFinite(id) || id <= 0) return false;

  const result = await pool.query(
    `DELETE FROM roadmaps
     WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );

  return result.rowCount > 0;
}

async function generateRoadmap(userInput, options = {}) {
  const {
    concept_id,
    duration_weeks,
    language,
    experience_level,
    accepted_concepts,
    daily_hours,
    days_per_week,
    roadmap_name
  } = userInput;

  // --------------------------------------------------
  // STEP 0 — Suggest prerequisites (BEGINNER ONLY)
  // --------------------------------------------------
  if (accepted_concepts === undefined && experience_level === "beginner") {
    const prereqQuery = `
      WITH RECURSIVE prereqs AS (
        SELECT prerequisite_id
        FROM concept_prerequisites
        WHERE concept_id = $1

        UNION

        SELECT p.prerequisite_id
        FROM concept_prerequisites p
        JOIN prereqs pr ON pr.prerequisite_id = p.concept_id
      )
      SELECT c.id, c.name, c.level
      FROM concepts c
      WHERE c.id IN (SELECT prerequisite_id FROM prereqs);
    `;

    const result = await pool.query(prereqQuery, [concept_id]);
    let suggestions = result.rows;

    if (suggestions.length > 0) {
      const ids = suggestions.map(c => c.id);

      const edgesRes = await pool.query(`
        SELECT concept_id, prerequisite_id
        FROM concept_prerequisites
        WHERE concept_id = ANY($1::int[])
          AND prerequisite_id = ANY($1::int[])
      `, [ids]);

      const topoIndex = topoSort(suggestions, edgesRes.rows);
      suggestions.sort((a, b) => topoIndex[a.id] - topoIndex[b.id]);

      return {
        needs_suggestions: true,
        suggestions
      };
    }
  }

  // --------------------------------------------------
  // STEP 1 — Final Concept List
  // --------------------------------------------------
  let finalConceptIds = [];

  if (accepted_concepts && accepted_concepts.length > 0) {
    finalConceptIds = [...accepted_concepts, concept_id];
  } else {
    finalConceptIds = [concept_id];
  }

  // --------------------------------------------------
  // STEP 2 — Fetch exact concepts (UPDATED: Added mcq_quiz)
  // --------------------------------------------------
  // STEP 2 — Fetch exact concepts
  const conceptsResult = await pool.query(`
    SELECT id, name, level, out_degree_count, semantic_density, term_vector,
           explanation, example, summary, key_points, min_time_mins, max_time_mins, mcq_quiz
    FROM concepts
    WHERE id = ANY($1::int[])
  `, [finalConceptIds]);

  let concepts = conceptsResult.rows;
  const conceptIds = concepts.map(c => c.id);

  // --------------------------------------------------
  // STEP 3 — Get edges for subgraph
  // --------------------------------------------------
  const edgesResult = await pool.query(`
    SELECT concept_id, prerequisite_id
    FROM concept_prerequisites
    WHERE concept_id = ANY($1::int[])
       OR prerequisite_id = ANY($1::int[])
  `, [conceptIds]);

  const edges = edgesResult.rows;

  // --------------------------------------------------
  // STEP 4 — Topological Order ONLY
  // --------------------------------------------------
  const topoIndex = topoSort(concepts, edges);
  concepts.sort((a, b) => topoIndex[a.id] - topoIndex[b.id]);

  // Ensure target concept last
  const targetIndex = concepts.findIndex(c => c.id == concept_id);
  if (targetIndex !== -1) {
    const [targetConcept] = concepts.splice(targetIndex, 1);
    concepts.push(targetConcept);
  }

  // --------------------------------------------------
  // STEP 5 — Cognitive Metrics & Time Allocation
  // --------------------------------------------------
  calculateGlossaryLoad(concepts);
  calculateActiveIndegree(concepts, edges);
  calculateRelativeDepth(concepts);
  calculateICF(concepts);
  calculateWeights(concepts, experience_level);

  const totalHours = daily_hours * days_per_week * duration_weeks;
  const totalMinutes = totalHours * 60;

  const feasibility = validatePathFeasibility(concepts, totalMinutes);
  if (!feasibility.isFeasible) {
    return {
      needs_suggestions: false,
      status: "UNREALISTIC",
      message: `Insufficient time. You need at least ${Math.ceil(feasibility.minRequired / 60)} hours to learn these concepts properly.`,
      min_required_hours: Math.ceil(feasibility.minRequired / 60)
    };
  }

  const { totalSurplus } = allocateTime(concepts, totalMinutes);

  // --------------------------------------------------
  // STEP 6 — Build roadmap + log
  // --------------------------------------------------
  const roadmapConcepts = [];

  for (const concept of concepts) {
    const resources = await pool.query(
      `SELECT url, content_type
       FROM resources
       WHERE concept_id = $1
       AND (implementation_language = $2 OR implementation_language = 'general')
       ORDER BY authority_score DESC
       LIMIT 3`,
      [concept.id, language]
    );

    await pool.query(
      `INSERT INTO learning_metrics_log
       (concept_id, icf, glossary_load, active_indegree, relative_depth,
        out_degree_count, semantic_density, study_time, buffer_time, total_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        parseInt(concept.id),
        parseFloat(concept.icf),
        parseFloat(concept.glossary_load),
        parseInt(concept.active_indegree),
        parseInt(concept.relative_depth),
        parseInt(concept.out_degree_count),
        parseFloat(concept.semantic_density),
        Math.round(concept.base_time),
        Math.round(concept.buffer_time),
        Math.round(concept.study_time)
      ]
    );

   roadmapConcepts.push({
      concept_id: concept.id,
      concept: concept.name,
      level: concept.level,
      phase: getPhase(concept.level),
      explanation: concept.explanation,
      example: concept.example,
      summary: concept.summary,
      key_points: concept.key_points,
      resources: resources.rows,
      study_time: concept.study_time,
      buffer_time: concept.buffer_time,
      icf: concept.icf,
      glossary_load: concept.glossary_load,
      is_pivoted: concept.is_pivoted_to_application,
      application_surplus: concept.surplus_time || 0,
      
      mcq_quiz: concept.mcq_quiz // <--- ADD THIS LINE HERE
    });
  }

  // --------------------------------------------------
  // STEP 7 — Weekly Distribution
  // --------------------------------------------------
  const weeklyPlan = distributeConcepts(
    roadmapConcepts,
    duration_weeks,
    daily_hours,
    days_per_week
  );
  // NEW: Prepare Data for Cytoscape.js Visualization
  const conceptIdSet = new Set(concepts.map(c => c.id));
  const validEdges = edges.filter(e => 
    conceptIdSet.has(e.concept_id) && conceptIdSet.has(e.prerequisite_id)
  );

  const graphData = {
    nodes: concepts.map(c => ({
      id: String(c.id),
      name: c.name,
      level: c.level,
      icf: c.icf,
      out_degree: c.out_degree_count || 0
    })),
    edges: validEdges.map(e => ({
      source: String(e.prerequisite_id),
      target: String(e.concept_id)
    }))
  };

  const roadmapResult = {
    needs_suggestions: false,
    total_concepts: roadmapConcepts.length,
    roadmap: weeklyPlan,
    graph_data: graphData
  };

  if (options.userId) {
    const savedRoadmap = await persistRoadmapForUser(
      options.userId,
      roadmap_name,
      userInput,
      roadmapResult
    );
    roadmapResult.roadmap_id = savedRoadmap.roadmap_id;
    roadmapResult.roadmap_name = savedRoadmap.roadmap_name;
    roadmapResult.saved_at = savedRoadmap.saved_at;
    roadmapResult.progress_payload = savedRoadmap.progress_payload;
  }

  return roadmapResult;
}

module.exports = {
  generateRoadmap,
  getLatestRoadmapForUser,
  listRoadmapsForUser,
  getRoadmapForUser,
  updateRoadmapProgressForUser,
  deleteRoadmapForUser
};