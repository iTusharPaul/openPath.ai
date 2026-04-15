require("dotenv").config();
const pool = require("../db/db");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY2);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateMCQs(conceptName) {
  // Using gemini-1.5-flash as it is fast and excellent at JSON formatting
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
  });

  const prompt = `
You are an educational assessment expert.

Generate exactly 3 Multiple Choice Questions (MCQs) to test a student's understanding of the following computer science topic:
Topic: ${conceptName}

Return ONLY a JSON array in this EXACT format. Do not include markdown formatting, markdown code blocks (like \`\`\`json), or extra text.

[
  {
    "question": "The question text goes here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_index": 0, 
    "explanation": "Briefly explain why this is the correct answer."
  }
]

Notes:
- "correct_index" must be an integer from 0 to 3 representing the correct option in the array.
- Make the questions conceptual, accurate, and beginner-friendly.
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON safely (looking for an array instead of an object)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
        console.log(`Could not extract JSON array from response for ${conceptName}.`);
        console.log("Raw Response:", text);
        return null;
    }

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.log("LLM Error:", err.message);
    return null;
  }
}

async function run() {
  // Fetch concepts that don't have a quiz generated yet
  const concepts = await pool.query(`
    SELECT id, name
    FROM concepts
    WHERE mcq_quiz IS NULL
  `);

  console.log(`Found ${concepts.rows.length} concepts to process.`);

  for (const concept of concepts.rows) {
    console.log("\nProcessing concept:", concept.name);

    // Call LLM with ONLY the concept name
    const mcqData = await generateMCQs(concept.name);

    if (mcqData && Array.isArray(mcqData)) {
      await pool.query(
        `UPDATE concepts
         SET mcq_quiz = $1
         WHERE id = $2`,
        [
          JSON.stringify(mcqData), // Store the array as JSONB
          concept.id
        ]
      );

      console.log(`✅ Saved 3 MCQs for: ${concept.name}`);
    } else {
      console.log(`❌ Failed to generate valid MCQs for: ${concept.name}`);
    }

    // Delay to avoid hitting API rate limits (5 seconds)
    await sleep(5000);
  }

  console.log("\n🎉 All concepts processed!");
  process.exit();
}

run();