function getExperienceMultiplier(level) {
  if (level === "beginner") return 1.2;
  if (level === "advanced") return 0.8;
  return 1.0;
}

// Normalize values to 0–1
function normalize(values) {
  const max = Math.max(...values);
  if (max === 0) return values.map(() => 0);
  return values.map(v => v / max);
}

// Step 1 — Glossary Load
function calculateGlossaryLoad(concepts) {
  let knownTerms = new Set();

  concepts.forEach(concept => {
    const terms = concept.term_vector || [];
    let newTerms = 0;

    terms.forEach(term => {
      if (!knownTerms.has(term)) newTerms++;
    });

    concept.glossary_load = newTerms;

    terms.forEach(term => knownTerms.add(term));
  });

  return concepts;
}

// Step 2 — Active In-degree
function calculateActiveIndegree(concepts, edges) {
  concepts.forEach(c => {
    c.active_indegree = edges.filter(e => e.concept_id == c.id).length;
  });
}

// Step 3 — Relative Depth
function calculateRelativeDepth(concepts) {
  concepts.forEach((c, index) => {
    c.relative_depth = index + 1;
  });
}

// Step 4 — ICF Calculation
function calculateICF(concepts) {
  const w1 = 0.4; // Structural
  const w2 = 0.2; // Semantic
  const w3 = 0.4; // Glossary

  const structureVals = concepts.map(c => c.active_indegree + Math.log(1 + c.relative_depth));
  const glossaryVals = concepts.map(c => c.glossary_load);

  const normStructure = normalize(structureVals);
  const normGlossary = normalize(glossaryVals);

  concepts.forEach((c, i) => {
    c.icf =
      (w1 * normStructure[i]) +
      (w2 * (c.semantic_density || 0)) +
      (w3 * normGlossary[i]);
  });

  return concepts;
}

// Step 5 — Weighted Importance
function calculateWeights(concepts, experience_level) {
  const E = getExperienceMultiplier(experience_level);

  concepts.forEach(c => {
    c.weight = c.icf * Math.log(Math.E + (c.out_degree_count || 0)) * E;
  });

  return concepts;
}

// Step 6 — Time Allocation + Buffer
function allocateTime(concepts, totalMinutes) {
  const totalWeight = concepts.reduce((sum, c) => sum + c.weight, 0) || 1;

  concepts.forEach(c => {
    c.base_time = totalMinutes * (c.weight / totalWeight);
  });

  const avgICF = concepts.reduce((s, c) => s + c.icf, 0) / concepts.length;
  const avgOut = concepts.reduce((s, c) => s + (c.out_degree_count || 0), 0) / concepts.length;
  const avgGL = concepts.reduce((s, c) => s + (c.glossary_load || 0), 0) / concepts.length;

  concepts.forEach(c => {
    let buffer = 0;

    if (c.icf > avgICF) buffer += 0.20 * c.base_time;
    if ((c.out_degree_count || 0) > avgOut) buffer += 0.15 * c.base_time;
    if ((c.glossary_load || 0) > avgGL) buffer += 0.10 * c.base_time;

    c.buffer_time = Math.round(buffer);
    c.study_time = Math.round(c.base_time + buffer);
  });

  return concepts;
}

// Step 7 — Weekly Distribution based on real weekly time
function distributeConcepts(concepts, weeks, daily_hours, days_per_week) {
  const weeklyCapacity = daily_hours * days_per_week * 60;

  const weeklyPlan = Array.from({ length: weeks }, (_, i) => ({
    week: i + 1,
    total_time: 0,
    concepts: []
  }));

  let currentWeek = 0;

  for (let concept of concepts) {
    let remainingTime = concept.study_time;
    const bufferRatio = concept.buffer_time / concept.study_time || 0;

    while (remainingTime > 0 && currentWeek < weeks) {
      let available = weeklyCapacity - weeklyPlan[currentWeek].total_time;

      if (available <= 0) {
        currentWeek++;
        continue;
      }

      const allocated = Math.min(remainingTime, available);

      // 🔥 proportional buffer
      const allocatedBuffer = Math.round(allocated * bufferRatio);
      const allocatedBase = allocated - allocatedBuffer;

      weeklyPlan[currentWeek].concepts.push({
        concept_id: concept.concept_id,
        concept: concept.concept,
        level: concept.level,
        phase: concept.phase,

        allocated_time: allocated,
        allocated_base_time: allocatedBase,
        allocated_buffer_time: allocatedBuffer,

        is_split: remainingTime !== concept.study_time,
        remaining_after: remainingTime - allocated
      });

      weeklyPlan[currentWeek].total_time += allocated;
      remainingTime -= allocated;

      if (remainingTime > 0) {
        currentWeek++;
      }
    }
  }

  return weeklyPlan;
}

module.exports = {
  calculateGlossaryLoad,
  calculateActiveIndegree,
  calculateRelativeDepth,
  calculateICF,
  calculateWeights,
  allocateTime,
  distributeConcepts
};