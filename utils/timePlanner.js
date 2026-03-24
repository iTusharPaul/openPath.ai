function getExperienceMultiplier(level) {
  if (level === "beginner") return 1.2;
  if (level === "advanced") return 0.8;
  return 1.0;
}

function calculateLWTA(concepts, experience_level, daily_hours, days_per_week, duration_weeks) {
  const E = getExperienceMultiplier(experience_level);

  // Total available time T (minutes)
  const totalHours = daily_hours * days_per_week * duration_weeks;
  const T = totalHours * 60;

  let totalWeight = 0;
  let totalSLI = 0;

  // Step 1 — Wi
  concepts.forEach(c => {
    const D = c.level;
    const S = c.out_degree_count || 0;

    c.weight = (D * E) * (1 + Math.log(1 + S));
    totalWeight += c.weight;
    totalSLI += S;
  });

  const avgSLI = totalSLI / concepts.length;

  // Step 2 — ti and buffer
  concepts.forEach(c => {
    const ti = T * (c.weight / totalWeight);

    let buffer = 0;
    if (c.out_degree_count > avgSLI) {
      buffer = 0.15 * ti;
    }

    c.study_time = Math.round(ti + buffer);
    c.buffer_time = Math.round(buffer);
  });

  return concepts;
}

function distributeConcepts(concepts, weeks) {
  const weeklyPlan = [];

  const totalTime = concepts.reduce((sum, c) => sum + c.study_time, 0);
  const timePerWeek = totalTime / weeks;

  let currentWeek = 1;
  let currentTime = 0;
  let weekConcepts = [];

  for (const concept of concepts) {
    if (currentTime + concept.study_time > timePerWeek && currentWeek < weeks) {
      weeklyPlan.push({
        week: currentWeek,
        concepts: weekConcepts
      });

      currentWeek++;
      weekConcepts = [];
      currentTime = 0;
    }

    weekConcepts.push(concept);
    currentTime += concept.study_time;
  }

  weeklyPlan.push({
    week: currentWeek,
    concepts: weekConcepts
  });

  while (weeklyPlan.length < weeks) {
    weeklyPlan.push({
      week: weeklyPlan.length + 1,
      concepts: []
    });
  }

  return weeklyPlan;
}

module.exports = { calculateLWTA, distributeConcepts };