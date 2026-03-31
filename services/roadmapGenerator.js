const pool = require("../db/db");

const {
  calculateGlossaryLoad,
  calculateActiveIndegree,
  calculateRelativeDepth,
  calculateICF,
  calculateWeights,
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

async function generateRoadmap(userInput) {
  const {
    concept_id,
    duration_weeks,
    language,
    experience_level,
    accepted_concepts,
    daily_hours,
    days_per_week
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
  // STEP 2 — Fetch prerequisite tree
  // --------------------------------------------------
  // --------------------------------------------------
  // STEP 2 — Fetch prerequisite tree (or specific concepts)
  // --------------------------------------------------
  let conceptsResult;

  if (accepted_concepts !== undefined) {
    // If suggestions were already processed and accepted concepts are provided,
    // ONLY fetch these exact nodes. Do not fetch recursively.
    conceptsResult = await pool.query(`
      SELECT id, name, level, out_degree_count, semantic_density, term_vector,
             explanation, example, summary, key_points
      FROM concepts
      WHERE id = ANY($1::int[])
    `, [finalConceptIds]);
  } else {
    // If no accepted_concepts are provided (e.g., advanced users where Step 0 is skipped),
    // do the full recursive fetch.
    conceptsResult = await pool.query(`
      WITH RECURSIVE all_nodes AS (
        SELECT id, name, level, out_degree_count, semantic_density, term_vector,
               explanation, example, summary, key_points
        FROM concepts
        WHERE id = ANY($1::int[])

        UNION

        SELECT c.id, c.name, c.level, c.out_degree_count, c.semantic_density, c.term_vector,
               c.explanation, c.example, c.summary, c.key_points
        FROM concepts c
        JOIN concept_prerequisites p ON c.id = p.prerequisite_id
        JOIN all_nodes an ON an.id = p.concept_id
      )
      SELECT DISTINCT * FROM all_nodes;
    `, [finalConceptIds]);
  }

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
  // STEP 5 — Cognitive Metrics
  // --------------------------------------------------
  calculateGlossaryLoad(concepts);
  calculateActiveIndegree(concepts, edges);
  calculateRelativeDepth(concepts);
  calculateICF(concepts);
  calculateWeights(concepts, experience_level);

  const totalHours = daily_hours * days_per_week * duration_weeks;
  const totalMinutes = totalHours * 60;

  allocateTime(concepts, totalMinutes);

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
      glossary_load: concept.glossary_load
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

  return {
    needs_suggestions: false,
    total_concepts: roadmapConcepts.length,
    roadmap: weeklyPlan
  };
}

module.exports = { generateRoadmap };