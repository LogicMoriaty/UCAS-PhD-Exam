
import React, { useState, useRef, useEffect } from 'react';
import { AppView, ExamData, VocabularyItem, ExamBatch, AppSettings, Translation, ReferenceBatch, ReferenceData } from './types';
import Button from './components/Button';
import ExamView from './components/ExamView';
import VocabSidebar from './components/VocabSidebar';
import { parseExamFiles, parseReferenceFiles, repairReferenceJson } from './services/geminiService';

const translations: Translation = {
  title: { en: "PhD English Prep", zh: "博士英语资格考试" },
  subtitle: { en: "Upload your PDF containing multiple mock exams.", zh: "上传包含多套模拟题的PDF文件。" },
  uploadBtn: { en: "Upload PDF", zh: "上传 PDF" },
  loadTest: { en: "Load Built-in Tests", zh: "加载内置模拟题" },
  dashboard: { en: "Dashboard", zh: "试题面板" },
  saveJson: { en: "Save All (JSON)", zh: "保存所有试题 (JSON)" },
  exportExam: { en: "Export JSON", zh: "导出 JSON" },
  startExam: { en: "Start Exam", zh: "开始答题" },
  vocabulary: { en: "Vocabulary", zh: "生词本" },
  settings: { en: "Settings", zh: "设置" },
  sections: { en: "Sections", zh: "部分" },
  back: { en: "Back", zh: "返回" },
  langLabel: { en: "Language", zh: "语言 / Language" },
  defSourceLabel: { en: "Definition Source", zh: "释义来源" },
  defSourceApi: { en: "Dictionary API (Free - English Only)", zh: "免费词典 API (仅英文)" },
  defSourceTrans: { en: "Translation Engine", zh: "翻译引擎" },
  defSourceLLM: { en: "AI Tutor (Rich Definitions)", zh: "AI 助教 (详细释义+中文)" },
  dictApiUrl: { en: "Dictionary API URL", zh: "词典 API 接口地址" },
  aiProviderLabel: { en: "AI Provider", zh: "AI 服务提供商" },
  deepseekKeyLabel: { en: "DeepSeek API Key", zh: "DeepSeek API 密钥" },
  close: { en: "Close", zh: "关闭" },
  loading: { en: "Loading...", zh: "加载中..." },
  uploadMaterials: { en: "Upload Ref Materials (Keys/Scripts)", zh: "上传参考资料 (答案/听力)" },
  refPanelTitle: { en: "Reference Materials Review", zh: "参考资料校对" },
  mergeMaterials: { en: "Merge to Exams", zh: "合并到试卷中" },
  downloadRefs: { en: "Download Reference JSON", zh: "下载参考资料 JSON" },
  rawEdit: { en: "Raw JSON Edit", zh: "编辑原始 JSON" },
  aiRepair: { en: "AI Repair & Organize", zh: "AI 修复与整理" },
  applyChanges: { en: "Apply Changes", zh: "应用更改" },
  navUpload: { en: "Upload", zh: "上传" },
  noExams: { en: "No exams loaded. Please upload a file or load built-in tests.", zh: "暂无试题。请上传文件 or 加载内置试题。" },
  loadError: { en: "Failed to load built-in tests. Please ensure the '/Test' folder is in your 'public' or static directory.", zh: "无法加载内置试题。请确保 '/Test' 文件夹位于您部署的 'public' 或静态资源目录中。" }
};

const App: React.FC = () => {
  // Default to DASHBOARD as requested
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  
  // Settings State - Initialize from localStorage or use defaults
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('appSettings');
    return saved ? JSON.parse(saved) : {
      language: 'zh', 
      definitionSource: 'llm', 
      dictionaryApiUrl: 'https://api.dictionaryapi.dev/api/v2/entries/en/',
      aiProvider: 'gemini'
    };
  });

  const [showSettings, setShowSettings] = useState(false);

  // Persist Settings
  useEffect(() => {
    localStorage.setItem('appSettings', JSON.stringify(settings));
  }, [settings]);

  // Data State
  const [availableExams, setAvailableExams] = useState<ExamData[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamData | null>(null);
  
  // Vocab List - Initialize from localStorage
  const [vocabList, setVocabList] = useState<VocabularyItem[]>(() => {
    const saved = localStorage.getItem('vocabList');
    return saved ? JSON.parse(saved) : [];
  });

  // Persist Vocab List
  useEffect(() => {
    localStorage.setItem('vocabList', JSON.stringify(vocabList));
  }, [vocabList]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null);
  const [loadError, setLoadError] = useState(false);
  
  // Reference Materials State
  const [referenceBatch, setReferenceBatch] = useState<ReferenceBatch | null>(null);
  const [showRefPanel, setShowRefPanel] = useState(false);
  const [activeRefTab, setActiveRefTab] = useState<string>("1");
  const [isEditingRef, setIsEditingRef] = useState(false);
  const [refJsonContent, setRefJsonContent] = useState("");
  
  // Refs
  const examInputRef = useRef<HTMLInputElement>(null);
  const refMaterialInputRef = useRef<HTMLInputElement>(null);

  const t = (key: string) => translations[key][settings.language];

  // Helper to append exams without overwriting and duplicates, AND SORT THEM
  const appendExams = (newExams: ExamData[]) => {
    setAvailableExams(prev => {
      const existingIds = new Set(prev.map(e => e.id));
      const uniqueNew = newExams.filter(e => !existingIds.has(e.id));
      
      const combined = [...prev, ...uniqueNew];
      // Sort exams by extracted number from ID or Title (e.g. "test-1", "Model Test 10")
      return combined.sort((a, b) => {
        const getNum = (str: string) => {
          const match = str.match(/(\d+)/);
          return match ? parseInt(match[1], 10) : 999;
        };
        return getNum(a.id || a.title) - getNum(b.id || b.title);
      });
    });
  };

  // Auto-load default JSONs on mount
  useEffect(() => {
    if (availableExams.length > 0) return;

    const loadDefaultExams = async () => {
      const files = ['/Test/JSON1-5.json', '/Test/JSON6-9.json', '/Test/JSON10.json'];
      const loadedExams: ExamData[] = [];
      let hasError = false;
      
      for (const path of files) {
        try {
          const res = await fetch(path);
          if (res.ok) {
            const text = await res.text();
            let data;
            try {
               data = JSON.parse(text);
            } catch (jsonErr) {
               console.error(`Error parsing JSON from ${path}:`, jsonErr);
               continue;
            }

            let examsFromFile: ExamData[] = [];
            if (data.exams && Array.isArray(data.exams)) {
              examsFromFile = data.exams;
            } else if (data.id && data.title) {
               examsFromFile = [data as ExamData];
            }

            loadedExams.push(...examsFromFile);
          } else {
            console.warn(`Failed to fetch ${path}: ${res.status}`);
            hasError = true;
          }
        } catch (e) {
          console.warn(`Failed to load default exam from ${path}`, e);
          hasError = true;
        }
      }
      
      if (loadedExams.length > 0) {
        appendExams(loadedExams);
        setLoadError(false);
      } else if (hasError) {
        setLoadError(true);
      }
    };
    
    loadDefaultExams();
  }, [availableExams.length]);

  const handleExamUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsProcessing(true);
    try {
      const files: File[] = Array.from(e.target.files);
      await processExamFiles(files);
    } catch (error) {
      console.error(error);
      alert("Failed to load exam. Please check your file.");
    } finally {
      setIsProcessing(false);
      if (examInputRef.current) examInputRef.current.value = '';
    }
  };

  const handleLoadDefaultJson = async () => {
    setIsProcessing(true);
    try {
      setAvailableExams([]); 
      // Force reload by clearing. The useEffect will handle it.
    } catch (error) {
      console.error(error);
      alert("Could not reload defaults.");
    } finally {
      setIsProcessing(false);
    }
  };

  const processExamFiles = async (files: File[]) => {
    const jsonlFile = files.find(f => f.name.endsWith('.jsonl'));
    if (jsonlFile) {
      try {
        const text = await jsonlFile.text();
        const lines = text.split('\n');
        const exams: ExamData[] = [];
        lines.forEach(line => {
          if (!line.trim()) return;
          try {
            const data = JSON.parse(line);
            if (data.exams && Array.isArray(data.exams)) exams.push(...data.exams);
            else if (data.title && data.sections) exams.push(data as ExamData);
          } catch (e) { console.warn("Skipping invalid JSONL line"); }
        });
        if (exams.length > 0) {
          appendExams(exams);
          setView(AppView.DASHBOARD);
          return;
        }
      } catch (err) { console.error(err); }
    }

    const jsonFile = files.find(f => f.type === 'application/json' || f.name.endsWith('.json'));
    if (jsonFile) {
      const text = await jsonFile.text();
      const data = JSON.parse(text);
      let newExams: ExamData[] = [];
      if (data.exams && Array.isArray(data.exams)) newExams = data.exams;
      else if (data.title && data.sections) newExams = [data as ExamData];
      
      if (newExams.length > 0) {
        appendExams(newExams);
        setView(AppView.DASHBOARD);
      }
      return;
    } 
    
    const result: ExamBatch = await parseExamFiles(files);
    appendExams(result.exams);
    
    try {
      const jsonFileName = files[0].name.replace(/\.[^/.]+$/, "") + ".json";
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ exams: result.exams }, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", jsonFileName);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } catch (e) { console.warn("Auto-export failed", e); }

    setView(AppView.DASHBOARD);
  };

  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsProcessing(true);
    try {
      const files: File[] = Array.from(e.target.files);
      const jsonFile = files.find(f => f.name.endsWith('.json') || f.type === 'application/json');

      let batchResult: ReferenceBatch;
      if (jsonFile) {
          const text = await jsonFile.text();
          batchResult = JSON.parse(text);
      } else {
          batchResult = await parseReferenceFiles(files);
      }
      
      setReferenceBatch(batchResult);
      if (batchResult.tests.length > 0) {
        setActiveRefTab(batchResult.tests[0].testId);
        setShowRefPanel(true);
      } else {
        alert("No recognizable tests found in reference file.");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to parse reference materials.");
    } finally {
      setIsProcessing(false);
      if (refMaterialInputRef.current) refMaterialInputRef.current.value = '';
    }
  };

  const handleAiRepair = async () => {
    if (!refJsonContent) return;
    setIsProcessing(true);
    try {
        const repaired = await repairReferenceJson(refJsonContent);
        setReferenceBatch(repaired);
        setRefJsonContent(JSON.stringify(repaired, null, 2));
        setIsEditingRef(false);
        if (repaired.tests.length > 0) setActiveRefTab(repaired.tests[0].testId);
    } catch (e) {
        alert("Repair failed. Please check your text.");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleApplyRefChanges = () => {
     try {
         const parsed = JSON.parse(refJsonContent);
         if (parsed.tests) {
             setReferenceBatch(parsed);
             setIsEditingRef(false);
             if (parsed.tests.length > 0) setActiveRefTab(parsed.tests[0].testId);
         } else {
             alert("Invalid structure. Must have { tests: [] }");
         }
     } catch (e) {
         alert("Invalid JSON syntax.");
     }
  };

  const handleDownloadRefJson = () => {
    if (!referenceBatch) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(referenceBatch, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `reference_materials_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const mergeReferencesToExams = () => {
    if (!referenceBatch) return;

    setAvailableExams(prevExams => {
      return prevExams.map(exam => {
        const examNumMatch = exam.title.match(/(?:Test|Test)\s*(\d+)/i) || exam.id.match(/test-?(\d+)/i);
        const examIdNum = examNumMatch ? parseInt(examNumMatch[1], 10) : null;

        if (examIdNum === null) return exam;

        const refData = referenceBatch.tests.find(t => {
           const refMatch = t.testId.toString().match(/(\d+)/);
           const refNum = refMatch ? parseInt(refMatch[1], 10) : -1;
           return refNum === examIdNum;
        });

        if (!refData) return exam;

        const newSections = exam.sections.map(section => {
          let newSection = { ...section };
          const isWriting = section.title.toLowerCase().includes("writing") || section.questions.some(q => q.type === 'writing');
          const isListening = section.title.toLowerCase().includes("listening");

          const scriptKeys = Object.keys(refData.tapescripts);
          const matchedScriptKey = scriptKeys.find(key => 
             section.title.toLowerCase().includes(key.toLowerCase()) || 
             key.toLowerCase().includes(section.title.toLowerCase())
          );
          if (matchedScriptKey) {
             newSection.tapescript = refData.tapescripts[matchedScriptKey];
          }

          newSection.questions = section.questions.map(q => {
            let newQ = { ...q };
            const qNumStr = q.number.toString();

            if (refData.answers[qNumStr]) {
               if (isWriting) {
                   const existingAns = q.correctAnswer;
                   const newAns = refData.answers[qNumStr];
                   if (!existingAns || existingAns.length < 5 || existingAns === 'A') {
                       newQ.correctAnswer = newAns;
                   }
                   if (matchedScriptKey && refData.tapescripts[matchedScriptKey]) {
                       newQ.correctAnswer = refData.tapescripts[matchedScriptKey];
                   }
               } else {
                   newQ.correctAnswer = refData.answers[qNumStr];
               }
            }
            
            const specificScriptKey = scriptKeys.find(k => {
               const cleanKey = k.replace(/[^0-9]/g, '');
               return cleanKey === qNumStr; 
            });

            if (specificScriptKey) {
                const scriptContent = refData.tapescripts[specificScriptKey];
                if (isListening && section.title.includes("Section A")) {
                    newQ.tapescript = scriptContent;
                    newQ.explanation = scriptContent; 
                } else if (scriptContent.length > 50) {
                    newQ.scriptContext = scriptContent;
                } else {
                    newQ.explanation = scriptContent;
                }
            }

            return newQ;
          });

          return newSection;
        });

        return { ...exam, sections: newSections };
      });
    });
    
    setShowRefPanel(false);
    alert(t('applyChanges') + " - " + t('mergeMaterials'));
  };

  const handleExportSingleExam = (exam: ExamData) => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ exams: [exam] }, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `${exam.title.replace(/[\/\\?%*:|"<>]/g, '_')}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  };

  const handleDownloadJson = () => {
    if (availableExams.length === 0) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ exams: availableExams }, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `exam_batch_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleSelectExam = (exam: ExamData) => {
    setSelectedExam(exam);
    setView(AppView.EXAM);
    setScore(null);
  };

  const handleSubmitExam = () => {
     if (!selectedExam) return;
     let total = 0;
     let correct = 0;
     
     selectedExam.sections.forEach(sec => {
        sec.questions.forEach(q => {
           if (q.type !== 'writing') {
               total++;
               const user = (q.userAnswer || "").toLowerCase().trim();
               const ans = (q.correctAnswer || "").toLowerCase().trim();
               
               let matchedUser = user;
               if (sec.sharedOptions && user.length > 1) {
                  const match = sec.sharedOptions.find(o => o.text.toLowerCase() === user);
                  if (match) matchedUser = match.label.toLowerCase();
               }

               if (matchedUser && ans) {
                   if (matchedUser === ans) correct++;
                   else if (ans.startsWith(matchedUser + ".")) correct++;
               }
           }
        });
     });
     
     setScore({ correct, total });
     setView(AppView.RESULTS);
  };
  
  const handleAnswerChange = (qId: string, val: string) => {
    if (!selectedExam) return;
    
    const newExam = { ...selectedExam };
    newExam.sections = newExam.sections.map(sec => ({
      ...sec,
      questions: sec.questions.map(q => {
        if (q.id === qId) return { ...q, userAnswer: val };
        return q;
      })
    }));
    setSelectedExam(newExam);
  };

  const addVocabulary = (word: string, def: string, context: string, cn?: string, syn?: string[], ant?: string[], collocations?: string[]) => {
     setVocabList(prev => [...prev, {
       id: crypto.randomUUID(),
       word,
       definition: def,
       chineseDefinition: cn,
       synonyms: syn,
       antonyms: ant,
       commonCollocations: collocations,
       contextSentences: [context],
       savedAt: Date.now()
     }]);
     setIsSidebarOpen(true);
  };

  const removeVocabulary = (id: string) => {
    setVocabList(prev => prev.filter(v => v.id !== id));
  };

  const handleBackToDashboard = () => {
      setSelectedExam(null);
      setView(AppView.DASHBOARD);
      setScore(null);
  };

  return (
    <div className="min-h-screen bg-academic-50 font-sans text-slate-800">
      <nav className="bg-academic-900 text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 sm:h-16 items-center">
            <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={() => setView(AppView.DASHBOARD)}>
              <div className="bg-white/10 p-1.5 sm:p-2 rounded-lg">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              </div>
              <span className="font-serif text-lg sm:text-xl font-bold tracking-tight truncate max-w-[150px] sm:max-w-none">{t('title')}</span>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3">
              <button 
                  onClick={() => setView(AppView.UPLOAD)} 
                  className={`text-sm font-medium hover:text-blue-200 transition-colors hidden sm:block ${view === AppView.UPLOAD ? 'text-blue-200 underline' : 'text-white'}`}
              >
                  {t('navUpload')}
              </button>
              <button onClick={() => setView(AppView.UPLOAD)} className="sm:hidden text-white p-2 hover:bg-white/10 rounded-full">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </button>
              <div className="h-6 w-px bg-white/20 mx-1 hidden sm:block"></div>
              <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-blue-200" title={t('settings')}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-full font-medium transition-all shadow-md flex items-center gap-2 text-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                <span className="hidden sm:inline">{t('vocabulary')}</span> ({vocabList.length})
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {isProcessing && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center animate-fadeIn mx-4">
               <div className="animate-spin rounded-full h-12 w-12 border-4 border-academic-500 border-t-transparent mb-4"></div>
               <p className="text-lg font-semibold text-gray-700">{t('loading')}</p>
            </div>
          </div>
        )}

        {/* UPLOAD PAGE */}
        {view === AppView.UPLOAD && (
           <div className="space-y-8 animate-fadeIn max-w-3xl mx-auto mt-4 sm:mt-10">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 text-center relative overflow-hidden">
                 <h2 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 mb-4">{t('uploadBtn')}</h2>
                 <p className="text-gray-500 mb-8 max-w-xl mx-auto text-sm sm:text-base">{t('subtitle')}</p>
                 
                 <div className="flex flex-col gap-4">
                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 sm:p-10 hover:bg-gray-50 transition-colors">
                        <label className="cursor-pointer flex flex-col items-center">
                            <div className="bg-academic-100 p-4 rounded-full mb-4">
                                <svg className="w-8 h-8 text-academic-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                            </div>
                            <span className="text-lg font-medium text-gray-700">Select Exam PDF / JSON</span>
                            <span className="text-sm text-gray-500 mt-2">Supports .pdf, .json, .jsonl</span>
                            <input 
                              type="file" 
                              ref={examInputRef}
                              accept=".pdf,.json,.jsonl" 
                              onChange={handleExamUpload} 
                              className="hidden" 
                              multiple 
                            />
                        </label>
                    </div>

                    <div className="border-2 border-dashed border-orange-200 rounded-xl p-4 sm:p-6 hover:bg-orange-50 transition-colors flex flex-col items-center justify-center">
                        <h3 className="text-sm font-semibold text-orange-800 uppercase tracking-wide mb-2">{t('uploadMaterials')}</h3>
                        <label className="cursor-pointer text-sm text-orange-600 hover:text-orange-800 underline flex items-center gap-2">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                             Upload Answer Keys / Scripts
                             <input 
                               type="file"
                               ref={refMaterialInputRef} 
                               accept=".pdf,.json,.txt" 
                               className="hidden" 
                               onChange={handleReferenceUpload} 
                             />
                        </label>
                    </div>
                 </div>
              </div>
           </div>
        )}

        {/* DASHBOARD PAGE */}
        {view === AppView.DASHBOARD && (
          <div className="animate-fadeIn">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                  <span className="w-2 h-8 bg-academic-500 rounded-full"></span>
                  {t('dashboard')}
                </h3>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button onClick={handleLoadDefaultJson} variant="secondary" className="text-sm py-1.5 flex-1 sm:flex-initial justify-center">{t('loadTest')}</Button>
                  <Button onClick={handleDownloadJson} variant="outline" className="text-sm py-1.5 flex-1 sm:flex-initial justify-center">{t('saveJson')}</Button>
                </div>
              </div>
              
              {availableExams.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 sm:p-12 text-center">
                    <div className="text-gray-400 mb-4">
                       <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    </div>
                    {loadError ? (
                        <div className="mb-6">
                            <h3 className="text-lg font-medium text-red-600 mb-2">{t('loadError').split("。")[0]}</h3>
                            <p className="text-sm text-gray-500 max-w-md mx-auto">{t('loadError').split("。")[1]}</p>
                        </div>
                    ) : (
                        <>
                            <h3 className="text-lg font-medium text-gray-900">{t('noExams')}</h3>
                            <p className="text-gray-500 mt-2 mb-6">Upload a new exam file to get started.</p>
                        </>
                    )}
                    <Button onClick={() => setView(AppView.UPLOAD)} className="w-full sm:w-auto">{t('uploadBtn')}</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {availableExams.map((exam, index) => (
                    <div key={exam.id || index} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-all duration-200 p-6 flex flex-col group">
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 bg-academic-100 text-academic-800 rounded-lg flex items-center justify-center font-bold text-xl font-serif group-hover:bg-academic-600 group-hover:text-white transition-colors">
                                {(exam.id.match(/\d+/) || exam.title.match(/\d+/) || [index + 1])[0]}
                            </div>
                            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-full">{exam.sections.length} {t('sections')}</span>
                          </div>
                          <h4 className="text-xl font-serif font-bold text-gray-900 mb-2 line-clamp-2">{exam.title}</h4>
                        </div>
                        <div className="flex gap-3 mt-6 pt-4 border-t border-gray-50">
                          <Button onClick={() => handleSelectExam(exam)} className="flex-1 justify-center" variant="primary">
                            {t('startExam')}
                          </Button>
                          <Button onClick={(e) => { e.stopPropagation(); handleExportSingleExam(exam); }} variant="outline" className="px-3" title={t('exportExam')}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          </Button>
                        </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

        {(view === AppView.EXAM || view === AppView.RESULTS) && selectedExam && (
           <ExamView 
             data={selectedExam}
             settings={settings}
             onAnswerChange={handleAnswerChange}
             onSubmit={handleSubmitExam}
             onAddVocab={addVocabulary}
             isReviewMode={view === AppView.RESULTS}
             score={score || undefined}
             onBack={handleBackToDashboard}
             onDashboard={handleBackToDashboard}
           />
        )}
      </div>

      <VocabSidebar 
        isOpen={isSidebarOpen} 
        vocabList={vocabList} 
        onClose={() => setIsSidebarOpen(false)} 
        onRemove={removeVocabulary}
        language={settings.language}
      />

      {/* Reference Panel */}
      {showRefPanel && referenceBatch && (
         <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-fadeIn">
                 <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                     <h3 className="font-bold text-lg text-gray-800">{t('refPanelTitle')}</h3>
                     <div className="flex items-center gap-2">
                         <Button 
                           variant={isEditingRef ? 'primary' : 'outline'} 
                           className="text-xs px-2 py-1"
                           onClick={() => {
                               if (!isEditingRef) setRefJsonContent(JSON.stringify(referenceBatch, null, 2));
                               setIsEditingRef(!isEditingRef);
                           }}
                         >
                            {t('rawEdit')}
                         </Button>
                         <button onClick={() => setShowRefPanel(false)} className="text-gray-500 hover:text-gray-700 ml-2"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                     </div>
                 </div>
                 
                 <div className="flex flex-1 overflow-hidden">
                     <div className="w-28 sm:w-40 bg-gray-50 border-r overflow-y-auto">
                         {referenceBatch.tests.map(test => (
                             <button 
                               key={test.testId}
                               onClick={() => { setActiveRefTab(test.testId); setIsEditingRef(false); }}
                               className={`w-full text-left px-4 py-3 text-sm font-medium border-b ${activeRefTab === test.testId ? 'bg-white text-academic-700 border-l-4 border-l-academic-600' : 'text-gray-600 hover:bg-gray-100'}`}
                             >
                                Test {test.testId}
                             </button>
                         ))}
                     </div>
                     
                     <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
                        {isEditingRef ? (
                            <div className="h-full flex flex-col gap-4">
                                <textarea 
                                    className="flex-1 w-full p-4 border rounded font-mono text-xs bg-gray-50 resize-none focus:ring-2 focus:ring-academic-500 outline-none"
                                    value={refJsonContent}
                                    onChange={(e) => setRefJsonContent(e.target.value)}
                                />
                                <div className="flex gap-4">
                                    <Button onClick={handleAiRepair} isLoading={isProcessing} className="flex-1 bg-purple-600 hover:bg-purple-700">{t('aiRepair')}</Button>
                                    <Button onClick={handleApplyRefChanges} className="flex-1">{t('applyChanges')}</Button>
                                </div>
                            </div>
                        ) : (
                            referenceBatch.tests.filter(t => t.testId === activeRefTab).map(test => (
                                <div key={test.testId} className="space-y-6">
                                    <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                                        <h4 className="font-bold text-green-800 mb-3 text-sm uppercase tracking-wide">Answers ({Object.keys(test.answers).length})</h4>
                                        <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-2 text-xs">
                                            {Object.entries(test.answers).map(([k, v]) => (
                                                <div key={k} className="bg-white px-2 py-1 border border-green-200 rounded flex justify-between items-center shadow-sm">
                                                    <span className="text-gray-400 font-mono mr-1">{k}</span>
                                                    <span className="font-bold text-gray-800">{v && (v as string).length > 3 ? 'Text' : v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                        <h4 className="font-bold text-blue-800 mb-3 text-sm uppercase tracking-wide">Scripts / Texts ({Object.keys(test.tapescripts).length})</h4>
                                        <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                                            {Object.entries(test.tapescripts).map(([k, v]) => (
                                                <div key={k} className="bg-white p-3 border border-blue-200 rounded shadow-sm">
                                                    <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded block w-fit mb-2">{k}</span>
                                                    <p className="text-xs text-gray-600 font-serif whitespace-pre-line leading-relaxed">
                                                        {(v as string).length > 200 ? (v as string).slice(0, 200) + "..." : v}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                     </div>
                 </div>

                 <div className="p-4 border-t bg-gray-50 rounded-b-xl flex flex-col sm:flex-row justify-between items-center gap-3">
                    <button onClick={handleDownloadRefJson} className="text-sm text-academic-600 hover:text-academic-800 hover:underline">{t('downloadRefs')}</button>
                    <div className="flex gap-3 w-full sm:w-auto">
                       <Button onClick={() => setShowRefPanel(false)} variant="secondary" className="flex-1 sm:flex-initial justify-center">{t('close')}</Button>
                       <Button onClick={mergeReferencesToExams} className="flex-1 sm:flex-initial justify-center">{t('mergeMaterials')}</Button>
                    </div>
                 </div>
             </div>
         </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-6 text-gray-900">{t('settings')}</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('langLabel')}</label>
                <div className="flex rounded-md shadow-sm" role="group">
                  <button onClick={() => setSettings({...settings, language: 'en'})} className={`px-4 py-2 text-sm font-medium border rounded-l-lg flex-1 transition-colors ${settings.language === 'en' ? 'bg-academic-800 text-white border-academic-800' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>English</button>
                  <button onClick={() => setSettings({...settings, language: 'zh'})} className={`px-4 py-2 text-sm font-medium border rounded-r-lg flex-1 -ml-px transition-colors ${settings.language === 'zh' ? 'bg-academic-800 text-white border-academic-800' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>中文 (Chinese)</button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('aiProviderLabel')}</label>
                <div className="flex gap-3">
                   <button 
                     onClick={() => setSettings({...settings, aiProvider: 'gemini'})}
                     className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${settings.aiProvider === 'gemini' ? 'bg-blue-50 border-blue-500 text-blue-800 ring-1 ring-blue-500' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                   >
                     Gemini (Default)
                   </button>
                   <button 
                     onClick={() => setSettings({...settings, aiProvider: 'deepseek'})}
                     className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${settings.aiProvider === 'deepseek' ? 'bg-purple-50 border-purple-500 text-purple-800 ring-1 ring-purple-500' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                   >
                     DeepSeek
                   </button>
                </div>
              </div>

              {settings.aiProvider === 'deepseek' && (
                <div className="animate-fadeIn bg-gray-50 p-4 rounded-lg border border-gray-200">
                   <label className="block text-sm font-medium text-gray-700 mb-2">{t('deepseekKeyLabel')}</label>
                   <input 
                     type="password" 
                     className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                     placeholder="sk-..."
                     value={settings.deepseekApiKey || ''}
                     onChange={(e) => setSettings({...settings, deepseekApiKey: e.target.value})}
                   />
                   <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                     <strong>Note:</strong> Calling DeepSeek directly from the browser may be blocked by CORS policy. If you see "Failed to fetch", please use a proxy or switch back to Gemini.
                   </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('defSourceLabel')}</label>
                <div className="space-y-2">
                   <button onClick={() => setSettings({...settings, definitionSource: 'llm'})} className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${settings.definitionSource === 'llm' ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 text-blue-900 shadow-sm' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                      <div className="font-bold text-sm">AI Tutor (Recommended)</div>
                      <div className="text-xs opacity-75">Provides Chinese definition, synonyms, antonyms & usage.</div>
                   </button>
                   <button onClick={() => setSettings({...settings, definitionSource: 'translation'})} className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${settings.definitionSource === 'translation' ? 'bg-green-50 border-green-500 ring-1 ring-green-500 text-green-900 shadow-sm' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                      <div className="font-bold text-sm">Translation Engine</div>
                      <div className="text-xs opacity-75">Concise translation and definition.</div>
                   </button>
                   <button onClick={() => setSettings({...settings, definitionSource: 'api'})} className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${settings.definitionSource === 'api' ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500 text-purple-900 shadow-sm' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                      <div className="font-bold text-sm">Dictionary API</div>
                      <div className="text-xs opacity-75">Fast, English-only definitions.</div>
                   </button>
                </div>
              </div>
            </div>
            <div className="mt-8 flex justify-end">
              <Button onClick={() => setShowSettings(false)}>{t('close')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
