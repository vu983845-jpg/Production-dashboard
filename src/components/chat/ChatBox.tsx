"use client";

import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Minimize2, Maximize2, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Message = { id: string; role: 'user' | 'assistant'; content: string };

export function ChatBox() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current && !isMinimized && isOpen) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isMinimized, isOpen]);

  const toggleChat = () => {
    if (isOpen) {
      setIsOpen(false);
      setIsMinimized(false);
    } else {
      setIsOpen(true);
    }
  };

  const handleToggleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMinimized(!isMinimized);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: data.content }]);
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Lỗi kết nối, vui lòng thử lại.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-2 group"
          >
            <div className="bg-white dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 px-3 py-1.5 rounded-full shadow-md opacity-0 font-medium group-hover:opacity-100 transition-opacity whitespace-nowrap translate-y-2 group-hover:-translate-y-1">
              Ask AI Assistant
            </div>
            <Button
              onClick={toggleChat}
              size="icon"
              className="rounded-full w-14 h-14 shadow-xl bg-gradient-to-tr from-blue-700 to-blue-500 hover:from-blue-600 hover:to-blue-400 text-white transition-all hover:shadow-[0_0_20px_rgba(59,130,246,0.6)] hover:scale-105 active:scale-95 flex items-center justify-center p-0"
            >
              <MessageSquare className="w-6 h-6" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              height: isMinimized ? 'auto' : '500px'
            }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn(
              "fixed bottom-6 right-6 z-50 w-[calc(100vw-3rem)] sm:w-[400px] flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden",
              isMinimized ? "" : "max-h-[80vh]"
            )}
          >
            {/* Header */}
            <div 
              className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 cursor-pointer select-none" 
              onClick={() => isMinimized && setIsMinimized(false)}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Gemini AI Assistant</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> 
                    <span className="text-[10px] text-zinc-500 font-medium">Online</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-8 h-8 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300" 
                  onClick={handleToggleMinimize}
                >
                  {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-8 h-8 text-zinc-500 hover:text-red-600 dark:hover:text-red-400" 
                  onClick={(e) => { e.stopPropagation(); toggleChat(); }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Chat Area */}
            {!isMinimized && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white dark:bg-zinc-950 font-sans text-sm pb-8">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-3 opacity-80 mt-10">
                      <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-zinc-900 flex items-center justify-center">
                        <Bot className="w-7 h-7 text-blue-400 dark:text-zinc-500 shadow-sm" />
                      </div>
                      <h4 className="font-medium text-zinc-700 dark:text-zinc-300">Welcome to AI Support</h4>
                      <p className="text-center px-6 text-xs leading-relaxed max-w-[280px]">
                        I am your Gemini-powered assistant. Ask me anything about this dashboard, charts, or factory metrics.
                      </p>
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "flex w-full",
                          m.role === 'user' ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm text-[13px] leading-relaxed",
                            m.role === 'user'
                              ? "bg-blue-600 text-white rounded-br-sm"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-sm"
                          )}
                        >
                          {m.role === 'assistant' && <div className="font-bold text-[10px] text-zinc-400 mb-1 uppercase tracking-wider">Gemini</div>}
                          <div className="whitespace-pre-wrap">{m.content}</div>
                        </div>
                      </div>
                    ))
                  )}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center space-x-1.5 h-[40px]">
                        <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} className="h-1" />
                </div>

                {/* Input Area */}
                <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.2)]">
                  <form 
                    onSubmit={sendMessage}
                    className="flex flex-col gap-2 relative"
                  >
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask Gemini..."
                      className="w-full max-h-32 min-h-[44px] pl-3 pr-12 py-3 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-transparent focus:border-blue-500/30 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all resize-none overflow-y-auto text-[13px] scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700"
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage(e as unknown as React.FormEvent<HTMLFormElement>);
                        }
                      }}
                    />
                    <div className="absolute right-1.5 bottom-1.5 flex items-center">
                      <Button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        size="icon"
                        className="h-8 w-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors flex items-center justify-center p-0"
                      >
                        <Send className="w-3.5 h-3.5 ml-0.5" />
                      </Button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
