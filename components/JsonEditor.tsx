import React, { useState, useEffect } from 'react';

interface JsonEditorProps {
  data: any;
  onChange: (newData: any) => void;
  label: string;
  readOnly?: boolean;
}

const JsonEditor: React.FC<JsonEditorProps> = ({ data, onChange, label, readOnly = false }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(data, null, 2));
  }, [data]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setText(newVal);
    try {
      const parsed = JSON.parse(newVal);
      setError(null);
      onChange(parsed);
    } catch (err) {
      setError('Invalid JSON syntax');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-2">
        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</label>
        {error && <span className="text-xs text-red-500 font-mono">{error}</span>}
      </div>
      <textarea
        className={`flex-1 w-full bg-gray-900 border ${error ? 'border-red-500' : 'border-gray-700'} text-gray-300 font-mono text-xs p-3 rounded resize-none focus:outline-none focus:border-blue-500 transition-colors`}
        value={text}
        onChange={handleChange}
        spellCheck={false}
        readOnly={readOnly}
      />
    </div>
  );
};

export default JsonEditor;
