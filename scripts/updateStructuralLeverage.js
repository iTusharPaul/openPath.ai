require("dotenv").config();
const { pool } = require("../db/db");

async function updateSLI() {
  console.log("Calculating Structural Leverage Index...");

  // Count how many times a concept is used as prerequisite
  const result = await pool.query(`
    SELECT prerequisite_id, COUNT(*) AS out_degree
    FROM concept_prerequisites
    GROUP BY prerequisite_id
  `);

  // Reset all to 0
  await pool.query(`UPDATE concepts SET out_degree_count = 0`);

  // Update counts
  for (const row of result.rows) {
    await pool.query(
      `UPDATE concepts
       SET out_degree_count = $1
       WHERE id = $2`,
      [row.out_degree, row.prerequisite_id]
    );
  }

  console.log("Structural Leverage Updated!");
  process.exit();
}

updateSLI();