
import { GoogleGenAI, Type } from "@google/genai";
import { ExamBatch, VocabularyItem, DefinitionSource, ReferenceBatch, AppSettings } from "../types";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    // If fallback is needed but no Gemini key, we can't do anything.
    throw new Error("Gemini API Key is missing.");
  }
  return new GoogleGenAI({ apiKey });
};

// DeepSeek Helper
const callDeepSeek = async (prompt: string, systemInstruction: string, apiKey: string, jsonMode: boolean = false) => {
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ],
        response_format: jsonMode ? { type: 'json_object' } : undefined,
        stream: false
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`DeepSeek API Error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (error) {
    console.warn("DeepSeek Call Failed (Check CORS/Key):", error);
    throw error;
  }
};

// Helper to convert File to Base64
export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const examBatchSchema = {
  type: Type.OBJECT,
  properties: {
    exams: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                instructions: { type: Type.STRING },
                content: { type: Type.STRING, nullable: true },
                tapescript: { type: Type.STRING, nullable: true },
                sharedOptions: {
                  type: Type.ARRAY,
                  nullable: true,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      text: { type: Type.STRING }
                    },
                    required: ["label", "text"]
                  }
                },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      number: { type: Type.INTEGER },
                      text: { type: Type.STRING },
                      type: { type: Type.STRING, enum: ['multiple-choice', 'fill-blank', 'writing'] },
                      correctAnswer: { type: Type.STRING, nullable: true },
                      options: {
                        type: Type.ARRAY,
                        nullable: true,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            label: { type: Type.STRING },
                            text: { type: Type.STRING }
                          },
                          required: ["label", "text"]
                        }
                      }
                    },
                    required: ["id", "number", "text", "type"]
                  }
                }
              },
              required: ["id", "title", "instructions", "questions"]
            }
          }
        },
        required: ["id", "title", "sections"]
      }
    }
  },
  required: ["exams"]
};

export const parseExamFiles = async (files: File[]): Promise<ExamBatch> => {
  const ai = getClient();
  const modelId = "gemini-2.5-flash"; 
  const parts = await Promise.all(files.map(fileToGenerativePart));

  const prompt = `
    You are an expert Educational Content parser for Doctorate English exams.
    Parse the document into structured JSON.
    CRITICAL GROUPING RULES:
    1. Single Exam Entity: "Model Test 1" includes EVERYTHING (Part I Listening, Part II Reading/Vocab, Part III Writing). Combine them all into one Exam object.
    2. Section Splitting: In Reading Comprehension, create a SEPARATE section for EACH Passage. Use double newlines \\n\\n for paragraphs in 'content'.
    3. Banked Cloze: Identify list of words (A-O). Put in 'sharedOptions'. Replace blanks in text with '{{number}}'.
    4. Keys & Scripts: Look for "Key to Model Tests" and "Listening Scripts" at the END and map them.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        role: "user",
        parts: [...parts, { text: prompt }]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: examBatchSchema,
      }
    });
    return JSON.parse(response.text || '{}') as ExamBatch;
  } catch (error) {
    console.error("Error parsing exam:", error);
    throw error;
  }
};

const referenceSchema = {
  type: Type.OBJECT,
  properties: {
    tests: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          testId: { type: Type.STRING },
          answerPairs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { qNum: { type: Type.STRING }, ansVal: { type: Type.STRING } }, required: ["qNum", "ansVal"] } },
          scriptPairs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { secName: { type: Type.STRING }, content: { type: Type.STRING } }, required: ["secName", "content"] } }
        },
        required: ["testId"]
      }
    }
  },
  required: ["tests"]
};

export const repairReferenceJson = async (rawInput: string): Promise<ReferenceBatch> => {
  const ai = getClient();
  const prompt = `You are an expert JSON Repair agent. Fix syntax errors and standardize structure. Input Data: ${rawInput.slice(0, 30000)}`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: referenceSchema }
  });
  return processRawRefResponse(JSON.parse(response.text || '{ "tests": [] }'));
};

export const parseReferenceFiles = async (files: File[]): Promise<ReferenceBatch> => {
  const ai = getClient();
  const parts = await Promise.all(files.map(fileToGenerativePart));
  const prompt = `Extract Answer Keys, Listening Scripts, and Writing Samples. Identify each Model Test. Return JSON strictly following schema.`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: { role: "user", parts: [...parts, { text: prompt }] },
    config: { responseMimeType: "application/json", responseSchema: referenceSchema }
  });
  return processRawRefResponse(JSON.parse(response.text || '{ "tests": [] }'));
};

function processRawRefResponse(raw: any): ReferenceBatch {
  const tests = raw.tests.map((t: any) => ({
      testId: t.testId,
      answers: (t.answerPairs || []).reduce((acc: any, curr: any) => { if(curr.qNum && curr.ansVal) { const key = curr.qNum.toString().replace(/\D/g, ''); if (key) acc[key] = curr.ansVal.trim(); } return acc; }, {}),
      tapescripts: (t.scriptPairs || []).reduce((acc: any, curr: any) => { if(curr.secName && curr.content) acc[curr.secName] = curr.content; return acc; }, {})
  }));
  return { tests };
}

export const explainQuestion = async (
  questionText: string, 
  userAnswer: string, 
  correctAnswer: string, 
  context?: string,
  settings?: AppSettings
): Promise<string> => {
  const prompt = `Explain why the correct answer is correct. Question: ${questionText}. Context: ${context || "N/A"}. Correct: ${correctAnswer}. User: ${userAnswer}. Concise Chinese explanation.`;
  const systemInstruction = "You are a helpful tutor.";

  // DeepSeek Attempt with Fallback
  if (settings?.aiProvider === 'deepseek' && settings.deepseekApiKey) {
    try {
      return await callDeepSeek(prompt, systemInstruction, settings.deepseekApiKey);
    } catch (e) {
      console.warn("DeepSeek explain failed, falling back to Gemini.");
    }
  }

  // Fallback to Gemini
  const ai = getClient();
  const response = await ai.models.generateContent({ 
    model: "gemini-2.5-flash", 
    contents: prompt,
    config: { systemInstruction }
  });
  return response.text || "No explanation.";
};

export const defineWord = async (word: string, context: string, source: DefinitionSource = 'llm', apiUrl?: string, settings?: AppSettings): Promise<VocabularyItem> => {
  if (source === 'api') {
    // API logic remains same for English-only fallback
    const baseUrl = apiUrl || 'https://api.dictionaryapi.dev/api/v2/entries/en/';
    try {
      const res = await fetch(`${baseUrl}${word}`);
      if (!res.ok) throw new Error("Word not found");
      const data = await res.json();
      const entry = data[0];
      const defObj = entry.meanings?.[0]?.definitions?.[0];
      return {
        id: crypto.randomUUID(),
        word: entry.word || word,
        definition: defObj?.definition || "No definition found.",
        chineseDefinition: "", 
        synonyms: entry.meanings?.[0]?.synonyms || [],
        antonyms: entry.meanings?.[0]?.antonyms || [],
        commonCollocations: [],
        contextSentences: defObj?.example ? [defObj.example] : [],
        savedAt: Date.now()
      };
    } catch (e) { return { id: crypto.randomUUID(), word, definition: "Not found.", contextSentences: [], savedAt: Date.now() }; }
  }

  const systemInstruction = `You are a professional English-Chinese Dictionary. 
  You MUST provide the Chinese translation for the target word.
  If the word has multiple meanings, pick the one that fits the context: "${context}".
  Return synonyms, antonyms, and common usage examples.`;

  const prompt = `
    Define the word: "${word}". 
    Context: "${context}".
    
    Output JSON format:
    {
      "definition": "English definition",
      "chineseDefinition": "中文释义 (Must provide this)",
      "synonyms": ["syn1", "syn2"],
      "antonyms": ["ant1", "ant2"],
      "commonCollocations": ["phrase 1", "phrase 2"],
      "contextSentences": ["Example sentence 1", "Example sentence 2"]
    }
  `;

  // DeepSeek Implementation with Fallback
  if (settings?.aiProvider === 'deepseek' && settings.deepseekApiKey) {
    try {
      const jsonStr = await callDeepSeek(prompt, systemInstruction + " Return valid JSON.", settings.deepseekApiKey, true);
      const data = JSON.parse(jsonStr || "{}");
      return {
        id: crypto.randomUUID(),
        word,
        definition: data.definition || "No definition.",
        chineseDefinition: data.chineseDefinition || "暂无释义",
        synonyms: data.synonyms || [],
        antonyms: data.antonyms || [],
        commonCollocations: data.commonCollocations || [],
        contextSentences: data.contextSentences || [],
        savedAt: Date.now()
      };
    } catch(e) {
      console.error("DeepSeek Define Error, falling back to Gemini", e);
      // Fall through to Gemini below
    }
  }

  // Gemini Implementation
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            definition: { type: Type.STRING },
            chineseDefinition: { type: Type.STRING },
            synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
            antonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
            commonCollocations: { type: Type.ARRAY, items: { type: Type.STRING } },
            contextSentences: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["definition", "chineseDefinition", "contextSentences"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    return {
      id: crypto.randomUUID(),
      word,
      definition: data.definition || "No definition.",
      chineseDefinition: data.chineseDefinition || "暂无释义",
      synonyms: data.synonyms || [],
      antonyms: data.antonyms || [],
      commonCollocations: data.commonCollocations || [],
      contextSentences: data.contextSentences || [],
      savedAt: Date.now()
    };
  } catch (err) {
    console.error("Gemini Define Error", err);
    throw new Error("Failed to define word via AI.");
  }
};
