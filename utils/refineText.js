const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function refineChunkText(rawText) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
You are an educational content editor.

Clean and refine the following text into a clear learning explanation.
Remove:
- YouTube intro lines
- Promotions
- Social media links
- Hashtags
- Irrelevant text

Keep only the educational explanation.
Make it concise, beginner-friendly, and structured in 3–5 sentences.

Text:
${rawText}
`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

module.exports = { refineChunkText };