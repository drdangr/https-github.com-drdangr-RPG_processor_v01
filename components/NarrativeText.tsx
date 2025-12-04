import React from 'react';

interface NarrativeTextProps {
  text: string;
  onEntityClick?: (type: 'object' | 'player' | 'location', id: string, name: string) => void;
}

/**
 * Компонент для отображения нарративного текста с разметкой объектов.
 * Разметка: [object:ID:name], [player:ID:name], [location:ID:name]
 */
const NarrativeText: React.FC<NarrativeTextProps> = ({ text, onEntityClick }) => {
  // Регулярное выражение для поиска разметки [type:ID:name]
  const entityRegex = /\[(object|player|location):([^:]+):([^\]]+)\]/g;

  const parseText = () => {
    const parts: Array<{ type: 'text' | 'entity'; content: string; entityType?: string; entityId?: string; entityName?: string }> = [];
    let lastIndex = 0;
    let match;

    while ((match = entityRegex.exec(text)) !== null) {
      // Добавляем текст до разметки
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: text.substring(lastIndex, match.index)
        });
      }

      // Добавляем разметку
      const [, entityType, entityId, entityName] = match;
      parts.push({
        type: 'entity',
        content: match[0],
        entityType: entityType as 'object' | 'player' | 'location',
        entityId,
        entityName
      });

      lastIndex = match.index + match[0].length;
    }

    // Добавляем оставшийся текст
    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex)
      });
    }

    // Если не было разметки, возвращаем весь текст
    if (parts.length === 0) {
      parts.push({ type: 'text', content: text });
    }

    return parts;
  };

  const parts = parseText();

  const getEntityColor = (type: string) => {
    switch (type) {
      case 'object':
        return 'text-cyan-400 hover:text-cyan-300';
      case 'player':
        return 'text-purple-400 hover:text-purple-300';
      case 'location':
        return 'text-green-400 hover:text-green-300';
      default:
        return 'text-blue-400 hover:text-blue-300';
    }
  };

  const getEntityBgColor = (type: string) => {
    switch (type) {
      case 'object':
        return 'bg-cyan-400/20 hover:bg-cyan-400/30';
      case 'player':
        return 'bg-purple-400/20 hover:bg-purple-400/30';
      case 'location':
        return 'bg-green-400/20 hover:bg-green-400/30';
      default:
        return 'bg-blue-400/20 hover:bg-blue-400/30';
    }
  };

  const handleEntityClick = (type: 'object' | 'player' | 'location', id: string, name: string) => {
    if (onEntityClick) {
      onEntityClick(type, id, name);
    }
  };

  return (
    <div className="narrative-text prose prose-invert max-w-none">
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return <span key={index}>{part.content}</span>;
        } else {
          const { entityType, entityId, entityName } = part;
          if (!entityType || !entityId || !entityName) return null;

          const isClickable = !!onEntityClick;
          
          return (
            <span
              key={index}
              className={`
                ${getEntityColor(entityType)}
                ${getEntityBgColor(entityType)}
                px-1.5 py-0.5 rounded
                font-medium
                transition-colors
                ${isClickable ? 'cursor-pointer underline decoration-dotted' : ''}
              `}
              onClick={() => isClickable && handleEntityClick(entityType, entityId, entityName)}
              title={`${entityType}: ${entityName} (${entityId})`}
            >
              {entityName}
            </span>
          );
        }
      })}
    </div>
  );
};

export default NarrativeText;
