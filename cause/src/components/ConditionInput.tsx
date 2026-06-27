import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { QuestPoint } from '../types';
import {
  getMentionAt,
  filterPoints,
  resolvePointByName,
  insertMention,
  isCompleteMention,
  splitMentionSegments,
  extractMentionedPointIds,
  findCompleteMentionAt,
} from '../utils/mentions';

interface ConditionInputProps {
  value: string;
  onChange: (value: string) => void;
  points: QuestPoint[];
  currentPointId: string;
  onConnect: (fromId: string, toId: string, unlockCondition: string) => void;
  placeholder?: string;
}

export function ConditionInput({
  value,
  onChange,
  points,
  currentPointId,
  onConnect,
  placeholder,
}: ConditionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0);
  const [highlight, setHighlight] = useState(0);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  const mention = getMentionAt(value, cursor);
  const insideComplete = findCompleteMentionAt(value, cursor, points);
  const alreadyMentioned = new Set(extractMentionedPointIds(value, points, currentPointId));
  const suggestions = mention && !insideComplete
    ? filterPoints(points, mention.query, currentPointId).filter((p) => !alreadyMentioned.has(p.id))
    : [];

  const complete = isCompleteMention(value, cursor, points, currentPointId) || !!insideComplete;
  const open = !!mention && !insideComplete && suggestions.length > 0 && !complete;

  useEffect(() => {
    setHighlight(0);
  }, [mention?.query, mention?.start, open]);

  const applyMention = (point: QuestPoint) => {
    if (!mention || !textareaRef.current) return;
    const liveCursor = textareaRef.current.selectionStart;
    const { text, cursor: newCursor } = insertMention(
      value,
      mention.start,
      cursor,
      point.title,
    );
    // #region agent log
    fetch('http://127.0.0.1:7907/ingest/d5d54c4d-9320-4e06-bb7b-878d017e5208',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'187000'},body:JSON.stringify({sessionId:'187000',location:'ConditionInput.tsx:applyMention',message:'applyMention mutating text',data:{pointTitle:point.title,mentionStart:mention.start,stateCursor:cursor,liveCursor,removedSlice:value.slice(mention.start,cursor),beforeLen:value.length,afterLen:text.length,afterPreview:text.slice(0,120)},timestamp:Date.now(),hypothesisId:'C-D',runId:'pre-fix'})}).catch(()=>{});
    // #endregion
    onChange(text);
    onConnect(point.id, currentPointId, text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(newCursor, newCursor);
        setCursor(newCursor);
        resizeTextarea();
      }
    });
  };

  const tryConnectOnEnter = (): boolean => {
    if (!mention || complete) return false;
    const picked = suggestions[highlight] ?? resolvePointByName(points, mention.query, currentPointId);
    // #region agent log
    fetch('http://127.0.0.1:7907/ingest/d5d54c4d-9320-4e06-bb7b-878d017e5208',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'187000'},body:JSON.stringify({sessionId:'187000',location:'ConditionInput.tsx:tryConnectOnEnter',message:'tryConnectOnEnter',data:{mention,complete,pickedTitle:picked?.title??null,suggestionCount:suggestions.length,highlight},timestamp:Date.now(),hypothesisId:'C',runId:'pre-fix'})}).catch(()=>{});
    // #endregion
    if (picked) {
      applyMention(picked);
      return true;
    }
    return false;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const el = textareaRef.current;
      const liveCursor = el?.selectionStart ?? -1;
      const liveMention = el ? getMentionAt(value, liveCursor) : null;
      // #region agent log
      fetch('http://127.0.0.1:7907/ingest/d5d54c4d-9320-4e06-bb7b-878d017e5208',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'187000'},body:JSON.stringify({sessionId:'187000',location:'ConditionInput.tsx:handleKeyDown:Enter',message:'Enter keydown',data:{stateCursor:cursor,liveCursor,cursorMismatch:cursor!==liveCursor,valueLen:value.length,valuePreview:value.slice(0,120),mention:mention?{start:mention.start,query:mention.query}:null,liveMention:liveMention?{start:liveMention.start,query:liveMention.query}:null,insideComplete:!!insideComplete,complete,open,suggestionsCount:suggestions.length},timestamp:Date.now(),hypothesisId:'A-B',runId:'pre-fix'})}).catch(()=>{});
      // #endregion
    }
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        applyMention(suggestions[highlight]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && mention && !complete) {
      if (tryConnectOnEnter()) {
        e.preventDefault();
        // #region agent log
        fetch('http://127.0.0.1:7907/ingest/d5d54c4d-9320-4e06-bb7b-878d017e5208',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'187000'},body:JSON.stringify({sessionId:'187000',location:'ConditionInput.tsx:handleKeyDown',message:'Enter prevented for mention connect',data:{stateCursor:cursor},timestamp:Date.now(),hypothesisId:'C',runId:'pre-fix'})}).catch(()=>{});
        // #endregion
      }
    }
  };

  const syncCursor = () => {
    const el = textareaRef.current;
    if (el) setCursor(el.selectionStart);
  };

  const segments = splitMentionSegments(value, points);

  return (
    <div className="condition-input">
      <div className="mention-input input input--area">
        <div className="mention-input__mirror" aria-hidden>
          {value ? (
            segments.map((seg, i) =>
              seg.type === 'mention' ? (
                <span key={i} className="mention-link">{seg.value}</span>
              ) : (
                <span key={i}>{seg.value}</span>
              ),
            )
          ) : (
            <span className="mention-input__placeholder">{placeholder ?? ''}</span>
          )}
        </div>
        <textarea
          ref={textareaRef}
          className="mention-input__textarea"
          rows={1}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            const prev = value;
            if (next !== prev && next.length < prev.length && !e.nativeEvent.isTrusted) {
              // #region agent log
              fetch('http://127.0.0.1:7907/ingest/d5d54c4d-9320-4e06-bb7b-878d017e5208',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'187000'},body:JSON.stringify({sessionId:'187000',location:'ConditionInput.tsx:onChange',message:'unexpected shrink',data:{prevLen:prev.length,nextLen:next.length,prevPreview:prev.slice(0,120),nextPreview:next.slice(0,120)},timestamp:Date.now(),hypothesisId:'E',runId:'pre-fix'})}).catch(()=>{});
              // #endregion
            }
            if (next !== prev && next.length < prev.length) {
              // #region agent log
              fetch('http://127.0.0.1:7907/ingest/d5d54c4d-9320-4e06-bb7b-878d017e5208',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'187000'},body:JSON.stringify({sessionId:'187000',location:'ConditionInput.tsx:onChange',message:'text shortened',data:{prevLen:prev.length,nextLen:next.length,prevPreview:prev.slice(0,120),nextPreview:next.slice(0,120),selectionStart:e.target.selectionStart},timestamp:Date.now(),hypothesisId:'E',runId:'pre-fix'})}).catch(()=>{});
              // #endregion
            }
            onChange(next);
            setCursor(e.target.selectionStart);
            requestAnimationFrame(resizeTextarea);
          }}
          onKeyDown={handleKeyDown}
          onClick={syncCursor}
          onKeyUp={syncCursor}
          onSelect={syncCursor}
          spellCheck
        />
      </div>
      {open && (
        <ul className="mention-menu" role="listbox">
          {suggestions.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={`mention-menu__item ${i === highlight ? 'mention-menu__item--active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyMention(p);
                }}
              >
                <span className="mention-menu__at">@</span>
                {p.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
