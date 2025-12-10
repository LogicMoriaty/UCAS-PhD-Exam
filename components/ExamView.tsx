
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ExamData, ExamSection, Question, AppSettings, Language } from '../types';
import Button from './Button';
import { defineWord, explainQuestion } from '../services/geminiService';

interface ExamViewProps {
  data: ExamData;
  settings: AppSettings;
  onAnswerChange: (questionId: string, answer: string) => void;
  onSubmit: () => void;
  onAddVocab: (word: string, definition: string, context: string, chinese?: string, synonyms?: string[], antonyms?: string[], commonCollocations?: string[]) => void;
  isReviewMode?: boolean;
  score?: { correct: number; total: number };
  onBack?: () => void;
  onDashboard?: () => void;
}

const translations: Record<string, { en: string; zh: string }> = {
  questions: { en: "Questions", zh: "题目" },
  wordBank: { en: "Word Bank", zh: "词汇库" },
  submit: { en: "Submit", zh: "提交试卷" },
  viewTapescript: { en: "View Tapescript", zh: "查看听力原文" },
  hideTapescript: { en: "Hide Tapescript", zh: "隐藏听力原文" },
  listenToAudio: { en: "Listen to the audio conversation...", zh: "请听录音对话..." },
  typeHere: { en: "Type your answer here...", zh: "在此输入答案..." },
  writeHere: { en: "Write your response here...", zh: "在此撰写文章..." },
  loading: { en: "Loading...", zh: "加载中..." },
  define: { en: "Define", zh: "查询生词" },
  synonyms: { en: "Synonyms", zh: "近义词" },
  antonyms: { en: "Antonyms", zh: "反义词" },
  collocations: { en: "Common Usage", zh: "常用搭配" },
  examples: { en: "Examples", zh: "例句" },
  addToVocab: { en: "Add to Notebook", zh: "加入生词本" },
  uploadAudio: { en: "Upload Audio", zh: "上传听力音频" },
  uploadAudioHint: { en: "Upload audio file to play.", zh: "请上传音频文件播放。" },
  results: { en: "Results", zh: "考试结果" },
  correct: { en: "Correct Answer", zh: "正确答案" },
  explanation: { en: "Explanation", zh: "解析" },
  askAi: { en: "Ask AI Explain", zh: "AI 解析" },
  back: { en: "Back", zh: "返回" },
  sampleAnswer: { en: "Sample Answer / Script", zh: "参考范文 / 听力原文" },
  modeFill: { en: "Mode: Fill Answer", zh: "模式: 填空答题" },
  modeDefine: { en: "Mode: Dictionary", zh: "模式: 查词典" },
  tabPassage: { en: "Passage", zh: "文章" },
  tabQuestions: { en: "Questions", zh: "题目" },
  audioError: { en: "Audio failed to load.", zh: "音频加载失败。" },
  openAudio: { en: "Open Audio Directly", zh: "直接打开音频" },
  prevSection: { en: "Previous", zh: "上一节" },
  nextSection: { en: "Next", zh: "下一节" },
};

const ExamView: React.FC<ExamViewProps> = ({ 
  data, settings, onAnswerChange, onSubmit, onAddVocab,
  isReviewMode = false, score, onBack, onDashboard
}) => {
  const [activeSectionId, setActiveSectionId] = useState<string>(data.sections[0]?.id || '');
  const [selection, setSelection] = useState<{ text: string; top: number; left: number; context: string } | null>(null);
  const [isDefining, setIsDefining] = useState(false);
  const [definitionResult, setDefinitionResult] = useState<any | null>(null);
  const [showTapescript, setShowTapescript] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState(false);
  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(null);
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [openScripts, setOpenScripts] = useState<Record<string, boolean>>({});
  const [mobileTab, setMobileTab] = useState<'passage' | 'questions'>('passage');
  
  // Word Bank Interaction Mode
  const [wordBankMode, setWordBankMode] = useState<'fill' | 'define'>('fill');

  const t = (key: string) => translations[key][settings.language];

  useEffect(() => {
    if (data.sections.length > 0) setActiveSectionId(data.sections[0].id);
  }, [data.id]);

  const activeSection = useMemo(() => data.sections.find(s => s.id === activeSectionId), [data.sections, activeSectionId]);
  const activeSectionIndex = data.sections.findIndex(s => s.id === activeSectionId);
  const prevSection = data.sections[activeSectionIndex - 1];
  const nextSection = data.sections[activeSectionIndex + 1];

  const handleSectionChange = (sectionId: string) => {
    setActiveSectionId(sectionId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    setAudioError(false);
    if (activeSection?.audioSrc) setAudioUrl(activeSection.audioSrc);
    else setAudioUrl(null);
    return () => { if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl); };
  }, [activeSection?.id, activeSection?.audioSrc]);

  // Reset mobile tab when section changes
  useEffect(() => {
    setMobileTab('passage');
  }, [activeSectionId]);

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(file));
      setAudioError(false);
    }
  };

  const handleExplain = async (q: Question) => {
    if (!q.correctAnswer) return;
    setExplainingId(q.id);
    try {
      const expl = await explainQuestion(q.text, q.userAnswer || "No Answer", q.correctAnswer, activeSection?.content || "", settings);
      setExplanations(prev => ({ ...prev, [q.id]: expl }));
    } catch (e) { alert("Failed to get explanation"); } 
    finally { setExplainingId(null); }
  };

  const handleMouseUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const target = e.target as HTMLElement;
    // Prevent selection logic when interacting with inputs, buttons, or the popover itself
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('button') || target.closest('.dictionary-popover')) return;

    // Use setTimeout to allow the browser to complete the selection process (fixes mobile issues)
    setTimeout(() => {
        const sel = window.getSelection();
        if (sel && sel.toString().trim().length > 0) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          // Avoid phantom selections with zero size
          if (rect.width === 0 || rect.height === 0) return;

          const isMobile = window.innerWidth < 640;
          
          setSelection({
            text: sel.toString().trim(),
            top: isMobile ? 0 : rect.bottom + window.scrollY + 8, // Mobile handles position via fixed CSS
            left: isMobile ? 0 : rect.left + window.scrollX + (rect.width / 2),
            context: range.startContainer.textContent || ""
          });
          setDefinitionResult(null); 
        }
    }, 10);
  }, []);

  const handleBackgroundClick = (e: React.MouseEvent) => {
      // Important: If user just selected text, the native selection is still active.
      // We should NOT clear the popover in this case.
      const nativeSelection = window.getSelection();
      if (nativeSelection && nativeSelection.toString().length > 0) {
          return;
      }

      // Only clear if clicking purely on background, not on interactive elements
      if (selection && !(e.target as HTMLElement).closest('.dictionary-popover')) {
          setSelection(null);
          setDefinitionResult(null);
      }
  }

  const handleDefine = async () => {
    if (!selection) return;
    setIsDefining(true);
    try {
      const result = await defineWord(selection.text, selection.context, settings.definitionSource, undefined, settings);
      setDefinitionResult(result);
    } catch (error) {
      console.error(error);
      alert("Failed to define word. Please check your settings and network.");
      // Don't clear selection on error so user can try again
    } finally {
      setIsDefining(false);
    }
  };

  const triggerDefineDirectly = async (word: string, x: number, y: number) => {
    setSelection({ text: word, top: y + window.scrollY + 20, left: x + window.scrollX, context: "Word Bank" });
    setDefinitionResult(null);
    setIsDefining(true);
    try {
        const result = await defineWord(word, "Word Bank context", settings.definitionSource, undefined, settings);
        setDefinitionResult(result);
    } catch (error) { setSelection(null); } 
    finally { setIsDefining(false); }
  };

  const handleAddToVocab = () => {
    if (definitionResult && selection) {
       onAddVocab(definitionResult.word, definitionResult.definition, selection.context, definitionResult.chineseDefinition, definitionResult.synonyms, definitionResult.antonyms, definitionResult.commonCollocations);
       setSelection(null);
       setDefinitionResult(null);
    }
  };

  const handleWordBankClick = (e: React.MouseEvent, wordText: string) => {
      e.preventDefault();
      if (wordBankMode === 'fill') {
          if (focusedQuestionId && !isReviewMode) onAnswerChange(focusedQuestionId, wordText);
      } else {
          // Define Mode
          triggerDefineDirectly(wordText, e.clientX, e.clientY);
      }
  };

  const toggleScript = (qId: string) => setOpenScripts(prev => ({ ...prev, [qId]: !prev[qId] }));

  const renderQuestion = (q: Question) => {
    let isCorrect = false;
    let correctAnswerText = q.correctAnswer;
    if (isReviewMode && q.correctAnswer && q.type !== 'writing') {
        let userAns = q.userAnswer;
        if (activeSection?.sharedOptions && userAns && userAns.length > 1) {
           const matched = activeSection.sharedOptions.find(o => o.text.toLowerCase() === userAns?.toLowerCase());
           if (matched) userAns = matched.label; 
        }
        isCorrect = q.correctAnswer.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === (userAns ? userAns.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : "");
    }
    if (activeSection?.sharedOptions && q.correctAnswer) {
      const matched = activeSection.sharedOptions.find(o => o.label === q.correctAnswer);
      if (matched) correctAnswerText = `${q.correctAnswer}. ${matched.text}`;
    } else if (q.options && q.correctAnswer) {
      const matched = q.options.find(o => o.label === q.correctAnswer);
      if (matched) correctAnswerText = `${q.correctAnswer}. ${matched.text}`;
    }

    return (
      <div key={q.id} className="mb-4">
          {q.scriptContext && <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4 rounded-r text-sm text-blue-900 whitespace-pre-line">{q.scriptContext}</div>}
          <div className={`bg-white p-4 sm:p-5 rounded-xl border shadow-sm ${isReviewMode && q.type !== 'writing' ? (isCorrect ? 'border-green-200 bg-green-50/20' : 'border-red-200 bg-red-50/20') : 'border-gray-200'}`}>
            <div className="flex gap-3 sm:gap-4">
              <span className={`flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center font-bold rounded-lg text-sm mt-0.5 ${isReviewMode ? (isCorrect || q.type === 'writing' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800') : 'bg-academic-100 text-academic-900'}`}>{q.number}</span>
              <div className="flex-1 min-w-0">
                {q.text && q.text !== "Listen to the conversation" && <div className="text-gray-900 font-medium mb-3 text-sm sm:text-base">{q.text}</div>}
                {q.tapescript && (
                    <div className="mb-3">
                         <button onClick={() => toggleScript(q.id)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                             <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                             {openScripts[q.id] ? t('hideTapescript') : t('viewTapescript')}
                         </button>
                         {openScripts[q.id] && <div className="mt-2 text-xs bg-gray-50 p-3 rounded border text-gray-700 whitespace-pre-line">{q.tapescript}</div>}
                    </div>
                )}
                {q.type === 'multiple-choice' && q.options && (
                  <div className="space-y-2">
                    {q.options.map((opt) => (
                      <label key={opt.label} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer active:bg-gray-100 transition-colors ${q.userAnswer === opt.label ? (isReviewMode ? (isCorrect ? 'bg-green-100 border-green-300' : 'bg-red-50 border-red-300') : 'bg-academic-50 border-academic-300') : 'border-transparent hover:bg-gray-50'}`}>
                        <input type="radio" name={`question-${q.id}`} value={opt.label} checked={q.userAnswer === opt.label} onChange={(e) => !isReviewMode && onAnswerChange(q.id, e.target.value)} disabled={isReviewMode} className="mt-1" />
                        <div className="text-sm"><span className="font-bold text-gray-500 mr-2">{opt.label}.</span><span className="text-gray-800">{opt.text}</span></div>
                      </label>
                    ))}
                  </div>
                )}
                {(q.type === 'fill-blank') && <input type="text" className="w-full p-3 border rounded-lg bg-white text-black text-sm" placeholder={isReviewMode ? '' : t('typeHere')} value={q.userAnswer || ''} onChange={(e) => !isReviewMode && onAnswerChange(q.id, e.target.value)} disabled={isReviewMode} />}
                {q.type === 'writing' && <textarea className="w-full mt-2 p-3 border border-gray-300 rounded-lg h-48 bg-white text-black text-sm" placeholder={t('writeHere')} value={q.userAnswer || ''} onChange={(e) => !isReviewMode && onAnswerChange(q.id, e.target.value)} disabled={isReviewMode} />}
                {isReviewMode && (
                  <div className="mt-4 pt-3 border-t border-gray-100 text-sm">
                    {q.type === 'writing' && q.correctAnswer ? <div className="bg-white p-4 border rounded text-gray-800 whitespace-pre-line">{q.correctAnswer}</div> : <div className="flex justify-between items-center"><div className="text-academic-700 font-bold">{t('correct')}: {correctAnswerText}</div><button onClick={() => handleExplain(q)} disabled={!!explainingId} className="text-xs bg-academic-600 text-white px-3 py-1.5 rounded-full shadow-sm">{explainingId === q.id ? "..." : t('askAi')}</button></div>}
                    {(q.explanation || explanations[q.id]) && <div className="mt-2 bg-blue-50 text-blue-900 p-3 rounded text-sm">{q.explanation && <div className="mb-1">{q.explanation}</div>}{explanations[q.id]}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
      </div>
    );
  };

  const renderSplitLayout = (section: ExamSection) => (
    <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 lg:gap-8 h-auto lg:h-[calc(100vh-140px)]">
      {/* Mobile Tabs */}
      <div className="lg:hidden flex border-b border-gray-200 mb-4 bg-white sticky top-14 z-20 shadow-sm">
        <button onClick={() => setMobileTab('passage')} className={`flex-1 py-3 text-sm font-bold text-center border-b-2 transition-colors ${mobileTab === 'passage' ? 'border-academic-600 text-academic-800' : 'border-transparent text-gray-500'}`}>{t('tabPassage')}</button>
        <button onClick={() => setMobileTab('questions')} className={`flex-1 py-3 text-sm font-bold text-center border-b-2 transition-colors ${mobileTab === 'questions' ? 'border-academic-600 text-academic-800' : 'border-transparent text-gray-500'}`}>{t('tabQuestions')}</button>
      </div>

      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-y-auto custom-scrollbar p-6 lg:p-8 h-auto lg:h-full ${mobileTab === 'questions' ? 'hidden lg:block' : 'block'}`}>
        <div className="prose prose-lg font-serif text-justify text-gray-800 leading-8">
           {section.content?.split(/\n\n|\n/).map((para, idx) => (para.trim().length > 0 && <p key={idx} className="mb-4 indent-8">{para}</p>))}
        </div>
      </div>
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-6 lg:h-full ${mobileTab === 'passage' ? 'hidden lg:block' : 'block'}`}>
        <h3 className="text-xl font-bold font-serif text-academic-800 border-b pb-4 mb-4 sticky top-0 bg-white z-10 hidden lg:block">{t('questions')}</h3>
        {section.questions.map((q) => renderQuestion(q))}
      </div>
    </div>
  );

  const renderClozeLayout = (section: ExamSection) => {
    if (!section.content) return <div>No content.</div>;
    const parts = section.content.split(/(\{\{\d+\}\})/g);
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        {!isReviewMode && (
          <div className="sticky top-14 lg:top-4 z-20 bg-white/95 backdrop-blur-xl p-4 rounded-xl shadow-lg border border-academic-200 mb-6 ring-1 ring-black/5">
             <div className="flex justify-between items-center mb-3 border-b pb-2">
                 <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('wordBank')}</h4>
                 <div className="flex bg-gray-100 p-0.5 rounded-lg">
                    <button onClick={() => setWordBankMode('fill')} className={`px-2 sm:px-3 py-1 text-xs font-bold rounded-md transition-all ${wordBankMode === 'fill' ? 'bg-white text-academic-700 shadow-sm' : 'text-gray-500'}`}>{t('modeFill')}</button>
                    <button onClick={() => setWordBankMode('define')} className={`px-2 sm:px-3 py-1 text-xs font-bold rounded-md transition-all ${wordBankMode === 'define' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'}`}>{t('modeDefine')}</button>
                 </div>
             </div>
             <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
               {section.sharedOptions?.map(opt => (
                 <button key={opt.label} 
                   onClick={(e) => handleWordBankClick(e, opt.text)}
                   onContextMenu={(e) => { e.preventDefault(); triggerDefineDirectly(opt.text, e.clientX, e.clientY); }}
                   className={`border px-2 py-1.5 rounded-md text-sm font-medium transition-all shadow-sm active:scale-95 ${wordBankMode === 'define' ? 'border-purple-200 bg-purple-50 text-purple-900 hover:bg-purple-100 cursor-help' : 'border-gray-200 bg-white hover:bg-academic-50 hover:text-academic-700 cursor-pointer'}`}
                 >
                   <span className="font-bold opacity-60 mr-1">{opt.label}.</span>{opt.text}
                 </button>
               ))}
             </div>
          </div>
        )}
        <div className="bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-gray-200 font-serif text-lg leading-[2.5] text-justify text-gray-800">
           {parts.map((part, idx) => {
             const match = part.match(/\{\{(\d+)\}\}/);
             if (match) {
               const qNum = parseInt(match[1]);
               const question = section.questions.find(q => q.number === qNum);
               if (!question) return null;
               
               let style = 'border-gray-300';
               if (isReviewMode && question.correctAnswer) {
                 const cleanUser = (question.userAnswer || "").toLowerCase(); 
                 const isCorrect = cleanUser.length > 0 && question.correctAnswer.toLowerCase().includes(cleanUser.charAt(0)); 
                 style = isCorrect ? 'border-green-500 bg-green-50 text-green-900 font-bold' : 'border-red-400 bg-red-50 text-red-900 line-through decoration-red-500';
               } else if (focusedQuestionId === question.id) style = 'border-academic-500 bg-blue-50 ring-2 ring-blue-100';

               return (
                 <span key={idx} className="inline-block mx-1 relative">
                   <span className="absolute -top-3 left-0 text-[9px] font-bold text-gray-400">{question.number}</span>
                   <input type="text"
                    style={{ width: `${Math.max(6, (question.userAnswer?.length || 0) + 2)}ch` }}
                    className={`border-b-2 text-center font-sans font-medium outline-none px-1 bg-transparent min-w-[30px] rounded-none ${style}`}
                    value={question.userAnswer || ''}
                    onFocus={() => setFocusedQuestionId(question.id)}
                    onChange={(e) => !isReviewMode && onAnswerChange(question.id, e.target.value)}
                    disabled={isReviewMode}
                   />
                   {isReviewMode && !question.userAnswer && <span className="text-xs text-green-600 ml-1 font-sans">{question.correctAnswer}</span>}
                 </span>
               );
             }
             return <span key={idx}>{part}</span>;
           })}
        </div>
        {isReviewMode && (
          <div className="bg-white p-6 rounded-xl shadow border border-gray-100 mt-8">
            <h4 className="font-bold text-lg mb-4 text-gray-800">{t('correct')}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {section.questions.map(q => {
                 let ans = q.correctAnswer;
                 const matched = section.sharedOptions?.find(o => o.label === q.correctAnswer);
                 if (matched) ans = `${q.correctAnswer}. ${matched.text}`;
                 return <div key={q.id} className="text-sm bg-gray-50 p-2 rounded border border-gray-200"><span className="font-bold mr-2">{q.number}</span><span className="text-green-700 font-mono font-bold">{ans}</span></div>
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStandardLayout = (section: ExamSection) => {
    const isListening = section.title.toLowerCase().includes('listening') || section.title.includes('听力');
    return (
      <div className="max-w-3xl mx-auto space-y-8 pb-20">
        {isListening && !isReviewMode && (
           <div className="bg-white p-4 rounded-xl shadow-sm border border-academic-100 mb-6 flex flex-col sm:flex-row items-center gap-4 sticky top-14 sm:top-14 z-10 backdrop-blur-md bg-white/90">
              <div className="flex-1 w-full">
                {audioUrl ? (
                  <div>
                    {audioError ? (
                        <div className="flex items-center justify-between text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                            <span>{t('audioError')}</span>
                            <a href={audioUrl} target="_blank" rel="noopener noreferrer" className="underline font-bold text-red-700">{t('openAudio')}</a>
                        </div>
                    ) : (
                        <audio 
                            key={audioUrl} /* Force re-render on url change to fix mobile loading */
                            controls 
                            className="w-full h-10" 
                            src={audioUrl} 
                            controlsList="nodownload" 
                            preload="metadata"
                            onError={() => setAudioError(true)}
                        />
                    )}
                  </div>
                ) : (
                    <div className="text-gray-400 text-sm italic text-center py-2 bg-gray-50 rounded border border-dashed border-gray-300">{t('uploadAudioHint')}</div>
                )}
              </div>
              <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-sm font-medium flex items-center gap-2 w-full sm:w-auto justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  {t('uploadAudio')}
                  <input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
              </label>
           </div>
        )}
        {section.questions.map((q) => renderQuestion(q))}
      </div>
    );
  };

  if (!activeSection) return null;
  const isCloze = activeSection.sharedOptions && activeSection.sharedOptions.length > 0;
  const isReadingOrWriting = !isCloze && activeSection.content && activeSection.content.length > 200;

  return (
    <div className="flex flex-col min-h-screen bg-academic-50" onMouseUp={handleMouseUp} onTouchEnd={handleMouseUp} onClick={handleBackgroundClick}>
      <header className="flex-none bg-white border-b border-gray-200 shadow-sm z-30 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
             {onDashboard && <button onClick={onDashboard} className="text-gray-500 hover:text-academic-700"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></button>}
             <h1 className="text-sm sm:text-lg font-serif font-bold text-gray-800 truncate max-w-[150px] sm:max-w-md">{isReviewMode ? `${t('results')}: ${data.title}` : data.title}</h1>
          </div>
          <div className="flex-1 mx-2 flex space-x-2 overflow-x-auto custom-scrollbar pb-1 no-scrollbar">
            {data.sections.map(section => (
              <button key={section.id} onClick={() => { setActiveSectionId(section.id); window.scrollTo({top:0, behavior:'smooth'}); }} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border whitespace-nowrap ${activeSectionId === section.id ? 'bg-academic-800 text-white border-academic-800' : 'bg-white text-gray-500 border-gray-200'}`}>{section.title.replace(/Section |Part /i, '').slice(0, 15)}...</button>
            ))}
          </div>
          {!isReviewMode && <Button onClick={onSubmit} className="text-xs sm:text-sm py-1.5 px-3 sm:px-4">{t('submit')}</Button>}
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-4 md:p-8">
           <div className="max-w-7xl mx-auto">
              <div className="mb-4 sm:mb-8">
                <h2 className="text-xl sm:text-3xl font-serif font-bold text-academic-900 mb-3">{activeSection.title}</h2>
                <div className="text-gray-600 bg-white p-4 rounded-xl border-l-4 border-academic-400 text-xs sm:text-sm shadow-sm leading-relaxed">{activeSection.instructions}</div>
              </div>
              {isCloze ? renderClozeLayout(activeSection) : isReadingOrWriting ? renderSplitLayout(activeSection) : renderStandardLayout(activeSection)}
              
              <div className="flex justify-between items-center mt-10 pt-6 border-t border-gray-200">
                 <button
                    onClick={() => prevSection && handleSectionChange(prevSection.id)}
                    disabled={!prevSection}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${prevSection ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900' : 'text-gray-300 cursor-not-allowed'}`}
                 >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    <div className="text-left hidden sm:block">
                        <div className="text-xs text-gray-400 uppercase tracking-wider">{t('prevSection')}</div>
                        <div className="text-sm font-bold truncate max-w-[150px]">{prevSection?.title.replace(/Part \w+ /, '')}</div>
                    </div>
                    <span className="sm:hidden">{t('prevSection')}</span>
                 </button>

                 <button
                    onClick={() => nextSection && handleSectionChange(nextSection.id)}
                    disabled={!nextSection}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all shadow-sm ${nextSection ? 'bg-academic-800 text-white hover:bg-academic-900 hover:shadow-md' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
                 >
                    <div className="text-right hidden sm:block">
                        <div className="text-xs text-blue-200 uppercase tracking-wider">{t('nextSection')}</div>
                        <div className="text-sm font-bold truncate max-w-[150px]">{nextSection?.title.replace(/Part \w+ /, '')}</div>
                    </div>
                    <span className="sm:hidden">{t('nextSection')}</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                 </button>
              </div>
           </div>
      </main>

      {/* Dictionary Backdrop for Mobile */}
      {selection && window.innerWidth < 640 && (
        <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm transition-opacity" onClick={() => setSelection(null)}></div>
      )}

      {selection && (
        <div style={ window.innerWidth >= 640 ? { position: 'absolute', top: selection.top, left: selection.left, transform: 'translateX(-50%)' } : {} } 
             className={`dictionary-popover bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)] sm:shadow-2xl z-50 flex flex-col border-t sm:border border-gray-200 ring-1 ring-black/5 animate-fadeIn overflow-hidden
             ${window.innerWidth < 640 ? 'fixed bottom-0 left-0 w-full rounded-t-2xl max-h-[70vh] pb-6' : 'rounded-xl w-80 sm:w-96'}`}>
           {window.innerWidth < 640 && <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-1"></div>}
           <div className="p-3 bg-gradient-to-r from-gray-50 to-white border-b flex justify-between items-center">
             <span className="font-serif font-bold text-lg text-gray-800 capitalize px-2 truncate max-w-[200px]">{selection.text}</span>
             <div className="flex gap-2">
                {!definitionResult && <button onClick={handleDefine} disabled={isDefining} className="text-xs bg-academic-800 text-white px-3 py-1 rounded-full hover:bg-academic-900 shadow-sm">{isDefining ? t('loading') : t('define')}</button>}
                <button onClick={() => { setSelection(null); setDefinitionResult(null); }} className="text-gray-400 hover:text-gray-600 p-1"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
             </div>
           </div>
           {definitionResult && (
             <div className="p-4 overflow-y-auto custom-scrollbar bg-white text-sm max-h-[50vh] sm:max-h-80">
               <div className="mb-4 pb-3 border-b border-gray-100">
                  <div className="text-xl font-bold text-academic-900 mb-1">{definitionResult.chineseDefinition}</div>
                  <div className="text-gray-600 italic font-serif leading-relaxed">{definitionResult.definition}</div>
               </div>
               
               {definitionResult.commonCollocations?.length > 0 && (
                 <div className="mb-3 bg-purple-50 p-2.5 rounded border border-purple-100">
                   <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wider mb-1">{t('collocations')}</div>
                   <div className="text-purple-900 font-medium">{definitionResult.commonCollocations.join(' • ')}</div>
                 </div>
               )}

               <div className="grid grid-cols-2 gap-3 mb-3">
                 {definitionResult.synonyms?.length > 0 && (
                   <div><div className="text-[10px] text-gray-400 uppercase font-bold">{t('synonyms')}</div><div className="text-gray-600">{definitionResult.synonyms.slice(0,3).join(', ')}</div></div>
                 )}
                 {definitionResult.antonyms?.length > 0 && (
                   <div><div className="text-[10px] text-gray-400 uppercase font-bold">{t('antonyms')}</div><div className="text-gray-600">{definitionResult.antonyms.slice(0,3).join(', ')}</div></div>
                 )}
               </div>

               {definitionResult.contextSentences?.length > 0 && (
                 <div className="mb-3">
                   <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">{t('examples')}</div>
                   <ul className="list-disc list-inside text-gray-600 italic space-y-1">{definitionResult.contextSentences.slice(0,2).map((s:string,i:number)=><li key={i}>"{s}"</li>)}</ul>
                 </div>
               )}
               <button onClick={handleAddToVocab} className="w-full py-3 sm:py-2 bg-green-50 text-green-700 border border-green-200 rounded font-bold hover:bg-green-100 mt-2">{t('addToVocab')}</button>
             </div>
           )}
           {window.innerWidth >= 640 && <div className="w-3 h-3 bg-white border-l border-t border-gray-200 rotate-45 absolute -top-1.5 left-1/2 -translate-x-1/2"></div>}
        </div>
      )}
    </div>
  );
};

export default ExamView;
