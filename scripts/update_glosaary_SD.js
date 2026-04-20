require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Pool } = require("pg");

// 1. Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY2);

// 2. Initialize PostgreSQL Pool
const { pool } = require("../db/db");

/**
 * Calls Gemini to extract technical terms and forces a JSON response.
 */
async function extractTermVector(text) {
  // Using gemini-1.5-flash as it is fast and perfect for NLP extraction
  const model = genAI.getGenerativeModel({ 
      model: "gemini-flash-latest",
      // CRITICAL: Force the model to return a structured JSON object
      generationConfig: { responseMimeType: "application/json" } 
  });

  const prompt = `
  You are an expert Computer Science taxonomist.
  Extract the core technical glossary terms (noun chunks) from the following text.
  Return ONLY a JSON object with a single key "terms" containing an array of strings.
  Make sure the terms are lowercase.
  
  Example Output: {"terms": ["linked list", "memory address", "pointer"]}

  Text to analyze:
  ${text}
  `;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Parse the guaranteed JSON response
    const parsed = JSON.parse(responseText);
    return parsed.terms || [];
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    return [];
  }
}

/**
 * Calculates Semantic Density based on the extracted terms.
 */
function calculateSemanticDensity(text, termsArray) {
    if (!text || termsArray.length === 0) return 0;

    // Basic word count (splitting by whitespace)
    const totalWords = text.split(/\s+/).filter(word => word.length > 0).length;
    if (totalWords === 0) return 0;

    // Sentence count for the "Compression Factor"
    const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1;
    const compressionFactor = 1 / Math.sqrt(sentenceCount);

    const densityRatio = termsArray.length / totalWords;
    
    return parseFloat((densityRatio * compressionFactor).toFixed(4));
}

/**
 * Main function to fetch, process, and update the database.
 */
async function processDatabaseConcepts() {
  const client = await pool.connect();

  try {
    console.log("Fetching concepts that need term vectors...");
    
    // Fetch concepts that have an explanation but no term vector yet
    const query = `
      SELECT id, name, explanation 
      FROM concepts 
      WHERE semantic_density = 0 
        AND explanation IS NOT NULL;
    `;
    const { rows } = await client.query(query);
    
    console.log(`Found ${rows.length} concepts to process.\n`);

    for (const row of rows) {
      console.log(`Processing ID ${row.id}: ${row.name}...`);
      
      // 1. Extract Terms using Gemini
      const termVector = await extractTermVector(row.explanation);
      
      // 2. Calculate Semantic Density locally (fast, saves API tokens)
      const semanticDensity = calculateSemanticDensity(row.explanation, termVector);
      
      // 3. Update the Database
      const updateQuery = `
        UPDATE concepts 
        SET term_vector = $1, 
            semantic_density = $2 
        WHERE id = $3
      `;
      
      // PostgreSQL pg library automatically converts JS Arrays to SQL ARRAY[]
      await client.query(updateQuery, [termVector, semanticDensity, row.id]);
      
      console.log(`  -> Added ${termVector.length} terms | SD: ${semanticDensity}`);
      
      // Optional: Add a small delay to avoid hitting Gemini API rate limits
      await new Promise(resolve => setTimeout(resolve, 1000)); 
    }

    console.log("\n✅ Database update complete!");

  } catch (err) {
    console.error("Database Transaction Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

// Execute the script
processDatabaseConcepts();