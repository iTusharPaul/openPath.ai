function distributeConcepts(concepts, weeks) {
  const phaseOrder = [
    "Foundations",
    "Linear Data Structures",
    "Hashing & Heaps",
    "Trees",
    "Graphs"
  ];

  const phaseMap = {};
  phaseOrder.forEach(p => phaseMap[p] = []);

  concepts.forEach(c => {
    phaseMap[c.phase].push(c);
  });

  const plan = [];
  let week = 1;

  for (let phase of phaseOrder) {
    if (phaseMap[phase].length > 0) {
      plan.push({
        week: week++,
        phase: phase,
        concepts: phaseMap[phase]
      });
    }
  }

  return plan;
}

module.exports = { distributeConcepts };