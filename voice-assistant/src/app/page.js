"use client";

import { useState, useRef, useEffect } from 'react';
import { Mic, StopCircle, Loader2, Volume2 } from 'lucide-react';
import { Card, CardContent } from './components/ui/card';
import Markdown from "markdown-to-jsx";

const FinvoiceApp = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState([]);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  const formatContent = (content, symbols) => {
    if (symbols?.length > 1) {
      return (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  {symbols.map((symbol) => (
                    <th key={symbol} className="px-6 py-3 text-left text-sm font-bold text-gray-900 bg-gray-100 border-b">
                      {symbol}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {symbols.map((symbol) => (
                    <td key={symbol} className="px-6 py-4 text-sm text-gray-900 border-b">
                      {content.split('\n\n').find(section => section.includes(symbol)) || 'No data available'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Markdown
              options={{
                overrides: {
                  p: {
                    component: ({ children }) => {
                      const text = children.toString();
                      let className = 'py-1 text-sm text-gray-900 leading-relaxed';
                      
                      if (text.startsWith('•')) className += ' pl-4';
                      if (text.includes('↑')) className += ' text-green-600';
                      if (text.includes('↓')) className += ' text-red-600';
                      
                      return <div className={className}>{children}</div>;
                    }
                  }
                }
              }}
            >
              {content.split('\n\n')
                .filter(section => !symbols.some(symbol => section.includes(symbol)))
                .join('\n\n')}
            </Markdown>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <Markdown
          options={{
            overrides: {
              h1: {
                component: ({ children }) => (
                  <h1 className="text-xl font-bold text-gray-900 mt-4 mb-2">{children}</h1>
                )
              },
              h2: {
                component: ({ children }) => (
                  <h2 className="text-lg font-bold text-gray-900 mt-3 mb-2">{children}</h2>
                )
              },
              h3: {
                component: ({ children }) => {
                  const text = children.toString();
                  if (text.match(/^[A-Z\s]{2,}:/)) {
                    return <h3 className="text-lg font-bold text-gray-900 mt-4 mb-2">{children}</h3>;
                  }
                  return <h3 className="text-md font-bold text-gray-900 mt-2 mb-1">{children}</h3>;
                }
              },
              p: {
                component: ({ children }) => {
                  const text = children.toString();
                  
                  if (text.startsWith('•')) {
                    return <div className="pl-4 py-1 text-gray-800">{children}</div>;
                  }
                  
                  if (text.includes(': ')) {
                    const [label, value] = text.split(': ');
                    return (
                      <div className="flex justify-between py-1">
                        <span className="font-medium text-gray-900">{label}:</span>
                        <span className="text-gray-800">{value}</span>
                      </div>
                    );
                  }
                  
                  if (text.includes('BUY') || text.includes('STRONG BUY')) {
                    return <div className="py-1 font-bold text-green-600">{children}</div>;
                  }
                  if (text.includes('SELL') || text.includes('STRONG SELL')) {
                    return <div className="py-1 font-bold text-red-600">{children}</div>;
                  }
                  if (text.includes('HOLD')) {
                    return <div className="py-1 font-bold text-yellow-600">{children}</div>;
                  }
                  if (text.includes('Target:') || text.includes('Price Target:')) {
                    return <div className="py-1 font-bold text-blue-600">{children}</div>;
                  }
                  
                  return <div className="py-1 text-gray-800">{children}</div>;
                }
              }
            }
          }}
        >
          {content}
        </Markdown>
      </div>
    );
  };

  const startRecording = async () => {
    try {
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
        audioBitsPerSecond: 128000
      });

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioURL(URL.createObjectURL(audioBlob));
        await handleAudioSubmit(audioBlob);
      };

      mediaRecorderRef.current.start(1000);
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const handleAudioSubmit = async (audioBlob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.success) {
        if (data.transcription?.trim()) {
          setMessages(prev => [...prev, {
            role: 'user',
            content: data.transcription.trim(),
            timestamp: new Date().toLocaleTimeString()
          }]);
        }

        if (data.analysis?.trim()) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: data.analysis.trim(),
            symbols: data.symbols,
            timestamp: new Date().toLocaleTimeString()
          }]);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="bg-white shadow-sm flex-none">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Volume2 className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                FINVOICE
              </h1>
            </div>
            <div className="text-sm text-gray-700 font-medium">
              Voice-Powered Stock Analysis
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-7xl mx-auto px-4 py-8">
          <div className="h-full bg-white rounded-2xl shadow-lg">
            <div 
              ref={chatContainerRef}
              className="h-full overflow-y-auto p-6 space-y-6"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4">
                  <Volume2 className="h-16 w-16" />
                  <p className="text-lg font-medium">Start recording to analyze stocks</p>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <Card className={`max-w-[85%] ${
                      message.role === 'user' 
                        ? 'bg-blue-50 border-blue-100' 
                        : 'bg-white border-gray-100'
                    }`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-gray-900">
                            {message.role === 'user' ? 'You' : 'FINVOICE'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {message.timestamp}
                          </span>
                        </div>
                        <div className={message.role === 'user' ? 'text-blue-800' : 'text-gray-900'}>
                          {message.role === 'assistant' 
                            ? formatContent(message.content, message.symbols)
                            : message.content
                          }
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border-t shadow-lg flex-none">
        <div className="max-w-7xl mx-auto px-4">
          <div className="py-4 flex items-center justify-center space-x-4">
            {isProcessing ? (
              <div className="flex items-center space-x-2 text-blue-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="font-medium">Processing your request...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-3">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`p-4 rounded-full transition-all duration-200 ${
                    isRecording 
                      ? 'bg-red-100 hover:bg-red-200 text-red-600'
                      : 'bg-blue-100 hover:bg-blue-200 text-blue-600'
                  }`}
                >
                  {isRecording ? (
                    <StopCircle className="h-8 w-8 animate-pulse" />
                  ) : (
                    <Mic className="h-8 w-8" />
                  )}
                </button>
                {audioURL && (
                  <audio src={audioURL} controls className="w-64 h-8" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinvoiceApp;