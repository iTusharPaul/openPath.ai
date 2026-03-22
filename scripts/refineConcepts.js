require("dotenv").config();
const pool = require("../db/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function refineConcept(conceptName, combinedText) {
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
  });

  const prompt = `
You are an educational content generator.

Topic: ${conceptName}

From the raw content below, generate structured learning content.

Return ONLY JSON in this format:

{
  "explanation": "Explain the concept clearly in simple beginner-friendly way",
  "example": "Give a simple example",
  "summary": "2-3 sentence summary",
  "key_points": ["point 1", "point 2", "point 3", "point 4"]
}

Raw Content:
${combinedText}
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON safely
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.log("LLM Error:", err.message);
    return null;
  }
}

async function run() {
  const concepts = await pool.query(`
  SELECT id, name
  FROM concepts
  WHERE explanation IS NULL
     OR example IS NULL
     OR summary IS NULL
     OR key_points IS NULL
`);

  for (const concept of concepts.rows) {
    console.log("Processing concept:", concept.name);

    // Get all chunks for this concept
    const chunks = await pool.query(
      `SELECT chunk_text FROM content_chunks WHERE concept_id = $1`,
      [concept.id]
    );

    if (chunks.rows.length === 0) {
      console.log("No chunks found for:", concept.name);
      continue;
    }

    // Combine all chunk texts
    const combinedText = chunks.rows.map(c => c.chunk_text).join("\n\n");

    // Call LLM
    const refined = await refineConcept(concept.name, combinedText);

    if (refined) {
      await pool.query(
        `UPDATE concepts
         SET explanation = $1,
             example = $2,
             summary = $3,
             key_points = $4
         WHERE id = $5`,
        [
          refined.explanation,
          refined.example,
          refined.summary,
          JSON.stringify(refined.key_points),
          concept.id
        ]
      );

      console.log("Saved:", concept.name);
    } else {
      console.log("Failed for:", concept.name);
    }

    // Delay to avoid rate limit
    await sleep(5000);
  }

  console.log("All concepts processed!");
  process.exit();
}

run();