const pool = require("../db/db");
const { distributeConcepts } = require("../utils/timePlanner");

// Map level → Phase
function getPhase(level) {
  if (level == 1) return "Foundations";
  if (level == 2) return "Linear Data Structures";
  if (level == 3) return "Hashing & Heaps";
  if (level == 4) return "Trees";
  if (level == 5) return "Graphs";
  return "Other";
}

async function generateRoadmap(userInput) {
  const {
    concept_id,
    duration_weeks,
    language,
    experience_level,
    accepted_concepts
  } = userInput;

  // ----------------------------------
  // STEP 1 — Suggest concept_prerequisites (only first request)
  // ----------------------------------
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
      WHERE c.id IN (SELECT prerequisite_id FROM prereqs)
      ORDER BY c.level ASC;
    `;

    const result = await pool.query(prereqQuery, [concept_id]);

    if (result.rows.length > 0) {
      return {
        needs_suggestions: true,
        suggestions: result.rows
      };
    }
  }

  // ----------------------------------
  // STEP 2 — Decide final concept list
  // ----------------------------------
  let finalConceptIds = [];

  if (accepted_concepts && accepted_concepts.length > 0) {
    // User ACCEPTED suggestions
    finalConceptIds = [...accepted_concepts, concept_id];
  } else if (accepted_concepts && accepted_concepts.length === 0) {
    // User REJECTED suggestions
    finalConceptIds = [concept_id];
  } else {
    // Intermediate / advanced user
    finalConceptIds = [concept_id];
  }

  // ----------------------------------
  // STEP 3 — Fetch concepts
  // ----------------------------------
  let concepts;

  if (accepted_concepts && accepted_concepts.length > 0) {
    // Fetch concept_prerequisites + concepts recursively
    const allConceptsQuery = `
      WITH RECURSIVE all_nodes AS (
        SELECT id, name, level
        FROM concepts
        WHERE id = ANY($1::int[])

        UNION

        SELECT c.id, c.name, c.level
        FROM concepts c
        JOIN concept_prerequisites p ON c.id = p.prerequisite_id
        JOIN all_nodes an ON an.id = p.concept_id
      )
      SELECT DISTINCT id, name, level
      FROM all_nodes;
    `;

    const conceptsResult = await pool.query(allConceptsQuery, [finalConceptIds]);
    concepts = conceptsResult.rows;
  } else {
    // Only selected concept
    const conceptsResult = await pool.query(
      `SELECT id, name, level FROM concepts WHERE id = $1`,
      [concept_id]
    );
    concepts = conceptsResult.rows;
  }

  const conceptIds = concepts.map(c => c.id);

  // ----------------------------------
  // STEP 4 — Get edges for topo sort
  // ----------------------------------
  const edgesQuery = `
    SELECT concept_id, prerequisite_id
    FROM concept_prerequisites
    WHERE concept_id = ANY($1::int[]);
  `;

  const edgesResult = await pool.query(edgesQuery, [conceptIds]);
  const edges = edgesResult.rows;

  // ----------------------------------
  // STEP 5 — Topological Sort
  // ----------------------------------
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
    const node = queue.shift();
    topoOrder.push(node);

    for (let neighbor of graph[node] || []) {
      indegree[neighbor]--;
      if (indegree[neighbor] == 0) {
        queue.push(neighbor);
      }
    }
  }

  // ----------------------------------
  // STEP 6 — Sort by Level + Topo Order
  // ----------------------------------
  const topoIndex = {};
  topoOrder.forEach((id, index) => {
    topoIndex[id] = index;
  });

  concepts.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return (topoIndex[a.id] || 0) - (topoIndex[b.id] || 0);
  });

  // ----------------------------------
  // STEP 7 — Force target concept last
  // ----------------------------------
  const targetIndex = concepts.findIndex(c => c.id == concept_id);
  if (targetIndex !== -1) {
    const [targetConcept] = concepts.splice(targetIndex, 1);
    concepts.push(targetConcept);
  }

// ----------------------------------
// STEP 8 — Fetch explanation + resources
// ----------------------------------
const roadmapConcepts = [];

for (const concept of concepts) {
  // Fetch AI generated content from concepts table
  const conceptContentQuery = `
    SELECT explanation, example, key_points
    FROM concepts
    WHERE id = $1
  `;

  const conceptContentResult = await pool.query(conceptContentQuery, [concept.id]);
  const conceptContent = conceptContentResult.rows[0] || {};

  const explanation = {
    explanation: conceptContent.explanation || null,
    example: conceptContent.example || null,
    key_points: conceptContent.key_points || []
  };

  const resourceQuery = `
    SELECT url, content_type
    FROM resources
    WHERE concept_id = $1
    AND (implementation_language = $2 OR implementation_language = 'general')
    ORDER BY authority_score DESC
    LIMIT 3
  `;

  const resources = await pool.query(resourceQuery, [
    concept.id,
    language
  ]);

  roadmapConcepts.push({
    concept_id: concept.id,
    concept: concept.name,
    level: concept.level,
    phase: getPhase(concept.level),
    explanation,
    resources: resources.rows,
    study_time: 60
  });
}

  // ----------------------------------
  // STEP 9 — Distribute into weeks
  // ----------------------------------
  const weeklyPlan = distributeConcepts(
    roadmapConcepts,
    duration_weeks
  );

  return {
    needs_suggestions: false,
    total_concepts: roadmapConcepts.length,
    roadmap: weeklyPlan
  };
}

module.exports = { generateRoadmap };