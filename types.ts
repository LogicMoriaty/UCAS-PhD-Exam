
export type QuestionType = 'multiple-choice' | 'fill-blank' | 'writing' | 'unknown';

export interface Option {
  label: string; // A, B, C, D
  text: string;
}

export interface Question {
  id: string;
  number: number;
  text: string; // The question stem
  type: QuestionType;
  options?: Option[]; // For multiple choice
  correctAnswer?: string; // For auto-grading (A, B, C, D or text)
  userAnswer?: string;
  explanation?: string; // AI generated or extracted explanation
  tapescript?: string; // Specific script for this question (e.g. Section A conversation)
  scriptContext?: string; // Script passage appearing BEFORE this question (e.g. Section B passage)
  context?: string; // Reference to paragraph or conversation text if applicable
}

export interface ExamSection {
  id: string;
  title: string; // e.g., "Part I Listening Comprehension"
  instructions: string;
  content?: string; // Long reading passages
  tapescript?: string; // General section script fallback
  audioSrc?: string; // Path to audio file (e.g., /Listen/file.mp3)
  sharedOptions?: Option[]; // NEW: For Banked Cloze (A-O word list) shared across questions
  questions: Question[];
  passageAnalysis?: string; // NEW: AI generated analysis of the whole passage (Main Idea, Vocab)
}

export interface ExamData {
  id: string; // Added ID for list management
  title: string;
  sections: ExamSection[];
}

// Wrapper for the batch response
export interface ExamBatch {
  exams: ExamData[];
}

// For parsing the standalone answer key/script file
export interface ReferenceData {
  testId: string; // "1", "2", "3"... corresponding to Model Test numbers
  answers: Record<string, string>; // "1": "A", "2": "C"
  tapescripts: Record<string, string>; // "Part I Section A": "Script content..."
}

export interface ReferenceBatch {
  tests: ReferenceData[];
}

export interface VocabularyItem {
  id: string;
  word: string;
  definition: string;
  chineseDefinition?: string;
  synonyms?: string[];
  antonyms?: string[];
  commonCollocations?: string[]; // Phrases or common usage
  contextSentences: string[];
  savedAt: number;
}

export interface VocabExport {
  word: string;
  definition: string;
  context: string;
}

export enum AppView {
  UPLOAD = 'UPLOAD',
  DASHBOARD = 'DASHBOARD', // New view for listing multiple exams
  EXAM = 'EXAM',
  RESULTS = 'RESULTS',
  CHANGELOG = 'CHANGELOG', // New view for updates
}

export type Language = 'en' | 'zh';
export type DefinitionSource = 'llm' | 'translation' | 'api';

export interface AppSettings {
  language: Language;
  definitionSource: DefinitionSource;
  dictionaryApiUrl: string;
  aiProvider: 'gemini' | 'deepseek';
  deepseekApiKey?: string;
  deepseekBaseUrl?: string; // NEW: Allow custom base URL for proxy/CORS support
}

export interface Translation {
  [key: string]: {
    en: string;
    zh: string;
  }
}
