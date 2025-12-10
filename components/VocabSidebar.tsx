
import React from 'react';
import { VocabularyItem, Language } from '../types';
import Button from './Button';

interface VocabSidebarProps {
  isOpen: boolean;
  vocabList: VocabularyItem[];
  onClose: () => void;
  onRemove: (id: string) => void;
  language?: Language;
}

const translations: Record<string, { en: string; zh: string }> = {
  title: { en: "Vocabulary Notebook", zh: "生词本" },
  empty: { en: "No words saved yet.", zh: "暂无生词。" },
  instruction: { en: "Highlight text in the exam to define and save words.", zh: "在试题中选中文字即可查询并保存。" },
  synonyms: { en: "Syn:", zh: "近义:" },
  antonyms: { en: "Ant:", zh: "反义:" },
  usage: { en: "Usage:", zh: "搭配:" },
  export: { en: "Export to CSV", zh: "导出 CSV" }
};

const VocabSidebar: React.FC<VocabSidebarProps> = ({ isOpen, vocabList, onClose, onRemove, language = 'zh' }) => {
  const t = (key: string) => translations[key][language];

  const handleExport = () => {
    // Enhanced CSV export
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Word,Meaning (CN),Definition (EN),Synonyms,Antonyms,Collocations,Context\n"
      + vocabList.map(e => {
        const cn = e.chineseDefinition ? e.chineseDefinition.replace(/"/g, '""') : "";
        const syn = e.synonyms ? e.synonyms.join("; ").replace(/"/g, '""') : "";
        const ant = e.antonyms ? e.antonyms.join("; ").replace(/"/g, '""') : "";
        const col = e.commonCollocations ? e.commonCollocations.join("; ").replace(/"/g, '""') : "";
        return `"${e.word}","${cn}","${e.definition.replace(/"/g, '""')}","${syn}","${ant}","${col}","${e.contextSentences.join('; ').replace(/"/g, '""')}"`;
      }).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "my_exam_vocabulary.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div 
      className={`fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col border-l border-gray-200 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="h-full flex flex-col">
        <div className="p-4 bg-academic-900 text-white flex justify-between items-center shadow-md">
          <h2 className="text-lg font-serif font-semibold tracking-wide">{t('title')}</h2>
          <button onClick={onClose} className="hover:bg-white/20 p-1.5 rounded-full transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-50">
          {vocabList.length === 0 ? (
            <div className="text-center text-gray-400 mt-20 flex flex-col items-center">
              <svg className="w-12 h-12 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              <p className="font-medium">{t('empty')}</p>
              <p className="text-xs mt-2 max-w-[200px] leading-relaxed">{t('instruction')}</p>
            </div>
          ) : (
            vocabList.map((item) => (
              <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow group relative">
                <button 
                  onClick={() => onRemove(item.id)}
                  className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                  title="Remove"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <div className="mb-2">
                  <h3 className="font-bold text-lg text-academic-900 capitalize">{item.word}</h3>
                  {item.chineseDefinition && (
                    <span className="text-sm font-semibold text-academic-600 block mt-0.5">{item.chineseDefinition}</span>
                  )}
                </div>
                
                <p className="text-xs text-gray-600 italic font-serif mb-3 leading-relaxed border-l-2 border-gray-200 pl-2">{item.definition}</p>
                
                <div className="space-y-1.5">
                    {item.commonCollocations && item.commonCollocations.length > 0 && (
                       <div className="text-xs bg-purple-50 text-purple-800 p-1.5 rounded">
                         <span className="font-bold mr-1">{t('usage')}</span> {item.commonCollocations.slice(0,2).join(", ")}
                       </div>
                    )}
                    
                    <div className="flex flex-wrap gap-2">
                        {item.synonyms && item.synonyms.length > 0 && (
                           <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                             <span className="font-bold mr-1">{t('synonyms')}</span> {item.synonyms.slice(0, 2).join(", ")}
                           </span>
                        )}
                        {item.antonyms && item.antonyms.length > 0 && (
                           <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                             <span className="font-bold mr-1">{t('antonyms')}</span> {item.antonyms.slice(0, 2).join(", ")}
                           </span>
                        )}
                    </div>
                </div>

                {item.contextSentences.length > 0 && (
                   <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-500 italic">
                     "{item.contextSentences[0]}"
                   </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <Button 
            onClick={handleExport} 
            disabled={vocabList.length === 0} 
            className="w-full justify-center"
            variant="secondary"
          >
            {t('export')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VocabSidebar;
