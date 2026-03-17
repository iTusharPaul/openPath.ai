const pool = require("../db/db");
const { distributeConcepts } = require("../utils/timePlanner");

async function generateRoadmap(userInput) {

  const {
    concept_id,
    duration_weeks,
    language
  } = userInput;

  // STEP 1: Recursive tree with proper ordering (DFS)

  const conceptTreeQuery = `
    WITH RECURSIVE concept_tree AS (
      SELECT 
        id,
        name,
        level,
        parent_id,
        ARRAY[id] AS path
      FROM concepts
      WHERE id = $1

      UNION ALL

      SELECT 
        c.id,
        c.name,
        c.level,
        c.parent_id,
        ct.path || c.id
      FROM concepts c
      JOIN concept_tree ct ON c.parent_id = ct.id
    )

    SELECT
      ct.id,
      ct.name,
      ct.level,
      ct.path,
      COALESCE(SUM(cc.read_time), 10) AS total_time
    FROM concept_tree ct
    LEFT JOIN content_chunks cc
    ON cc.concept_id = ct.id
    GROUP BY ct.id, ct.name, ct.level, ct.path
    ORDER BY ct.path;  -- 🔥 THIS FIXES ORDER
  `;

  const conceptResult = await pool.query(
    conceptTreeQuery,
    [concept_id]
  );

  const concepts = conceptResult.rows;

  const roadmapConcepts = [];

  // STEP 2: Fetch explanation + resources

  for (const concept of concepts) {

    // Explanation

    const chunkQuery = `
      SELECT chunk_text, heading
      FROM content_chunks
      WHERE concept_id = $1
      ORDER BY read_time DESC
      LIMIT 1
    `;

    const chunkResult = await pool.query(
      chunkQuery,
      [concept.id]
    );

    const explanation = chunkResult.rows[0] || null;

    // Resources

    const resourceQuery = `
      SELECT url, content_type
      FROM resources
      WHERE concept_id = $1
      AND (implementation_language = $2 OR implementation_language = 'general')
      ORDER BY authority_score DESC
      LIMIT 3
    `;

    const resources = await pool.query(
      resourceQuery,
      [concept.id, language]
    );

    roadmapConcepts.push({
      concept_id: concept.id,
      concept: concept.name,
      study_time: Number(concept.total_time) || 10,
      explanation: explanation,
      resources: resources.rows
    });

  }

  // STEP 3: Distribute while preserving order

  const weeklyPlan = distributeConcepts(
    roadmapConcepts,
    duration_weeks
  );

  return {
    concept_id,
    duration_weeks,
    total_concepts: roadmapConcepts.length,
    roadmap: weeklyPlan
  };

}

module.exports = { generateRoadmap };