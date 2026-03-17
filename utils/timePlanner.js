function distributeConcepts(concepts, weeks) {

  const totalTime = concepts.reduce(
    (sum, c) => sum + (c.study_time || 10),
    0
  );

  const targetPerWeek = totalTime / weeks;

  const roadmap = [];
  let currentWeek = 0;
  let currentTime = 0;

  roadmap.push({
    week: 1,
    concepts: []
  });

  for (const concept of concepts) {

    if (currentTime >= targetPerWeek && currentWeek < weeks - 1) {

      currentWeek++;
      currentTime = 0;

      roadmap.push({
        week: currentWeek + 1,
        concepts: []
      });

    }

    roadmap[currentWeek].concepts.push(concept);
    currentTime += concept.study_time || 10;

  }

  return roadmap;
}

module.exports = { distributeConcepts };