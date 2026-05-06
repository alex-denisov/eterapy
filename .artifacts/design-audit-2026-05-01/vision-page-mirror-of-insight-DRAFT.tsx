'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HaloSymbol, BrandLogo } from '@/components/brand/brand-mark';
import { Search, Sparkles, Compass, Map, User, ArrowRight } from 'lucide-react';

export default function VisionPage() {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="min-h-screen bg-[#050A14] text-white selection:bg-brand-warm-gold/30 selection:text-white">
      {/* 
          EDITORIAL HEADER 
          Minimal, focused on the identity and the user
      */}
      <header className="fixed top-0 left-0 w-full z-50 px-8 py-10 flex justify-between items-end mix-blend-difference">
        <BrandLogo height={32} />
        <div className="flex items-center gap-12">
           <button className="text-[10px] font-bold tracking-[0.4em] uppercase opacity-40 hover:opacity-100 transition-opacity">
              Inquire
           </button>
           <button className="text-[10px] font-bold tracking-[0.4em] uppercase opacity-40 hover:opacity-100 transition-opacity">
              Journal
           </button>
           <User size={18} className="opacity-40 cursor-pointer hover:opacity-100" />
        </div>
      </header>

      <main className="relative flex flex-col items-center justify-center min-h-screen pt-20">
        
        {/* ATMOSPHERIC BACKGROUND */}
        <div className="fixed inset-0 pointer-events-none -z-10">
           {/* The "Subconscious" Aurora */}
           <motion.div 
             animate={{ 
               opacity: isFocused ? 0.3 : 0.15,
               scale: isFocused ? 1.1 : 1
             }}
             className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140vw] h-[100vh] bg-radial-[at_50%_50%] from-brand-lavender/10 via-transparent to-transparent blur-[120px]" 
           />
           <div className="absolute top-[30%] left-[20%] w-[60vw] h-[60vh] bg-radial-[at_50%_50%] from-brand-warm-gold/5 via-transparent to-transparent blur-[100px]" />
        </div>

        {/* 
            CENTRAL CLARITY INPUT 
            The heart of the "Search for Self"
        */}
        <section className="w-full max-w-4xl px-6 relative">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="flex flex-col items-center"
          >
            {/* The Dynamic Compass */}
            <div className="mb-16">
              <HaloSymbol size={200} className={isFocused ? 'scale-110' : 'scale-100'} />
            </div>

            <div className="text-center mb-20 space-y-6">
              <h1 className="display-1 text-primary tracking-tight">
                Найти себя. <br />
                Обрести ясность.
              </h1>
              <p className="text-text-secondary/60 text-lg font-light tracking-wide max-w-xl mx-auto">
                Ваш путь к ответам начинается здесь. Спросите о том, что действительно важно.
              </p>
            </div>

            {/* The Clarity Input Field */}
            <div className="w-full relative group">
               <motion.div 
                 animate={{ 
                    boxShadow: isFocused ? '0 0 80px rgba(212,161,90,0.15)' : '0 0 0px rgba(0,0,0,0)',
                    borderColor: isFocused ? 'rgba(212,161,90,0.4)' : 'rgba(255,255,255,0.08)'
                 }}
                 className="relative z-10 w-full bg-white/[0.02] backdrop-blur-3xl rounded-[2rem] border overflow-hidden transition-all duration-700"
               >
                  <div className="flex items-center px-10 py-8">
                    <Search className={`mr-6 transition-colors duration-500 ${isFocused ? 'text-primary' : 'text-white/20'}`} size={24} />
                    <input 
                      type="text"
                      placeholder="Что вас беспокоит сегодня?"
                      className="flex-1 bg-transparent border-none outline-none text-xl md:text-2xl font-light placeholder:text-white/10"
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <AnimatePresence>
                      {query && (
                        <motion.button
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="bg-brand-warm-gold text-brand-midnight-navy p-3 rounded-full hover:scale-110 transition-transform"
                        >
                          <ArrowRight size={20} />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Quick Insight Prompts */}
                  <div className={`flex gap-4 px-10 pb-8 transition-all duration-700 ${isFocused ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
                     {['Отношения', 'Карьера', 'Поиск призвания', 'Внутренний покой'].map((label) => (
                       <button key={label} className="text-[10px] font-bold tracking-widest uppercase py-2 px-4 rounded-full border border-white/5 hover:border-primary/40 hover:text-primary transition-all">
                          {label}
                       </button>
                     ))}
                  </div>
               </motion.div>
            </div>
          </motion.div>
        </section>

        {/* 
            VISIONARY TILES 
            Instead of feature lists, we show "States of Being"
        */}
        <section className="premium-container mt-40 grid grid-cols-1 md:grid-cols-3 gap-10">
           {[
             { 
               icon: <Sparkles size={24} />, 
               title: "Озарение", 
               desc: "Мгновенные ответы через AI-инструменты, когда нужна перспектива здесь и сейчас." 
             },
             { 
               icon: <Compass size={24} />, 
               title: "Навигация", 
               desc: "Глубокая работа с экспертами, чтобы найти выход из сложных жизненных лабиринтов." 
             },
             { 
               icon: <Map size={24} />, 
               title: "Архив Души", 
               desc: "Ваш персональный дневник инсайтов, где каждый ответ становится частью вашей карты." 
             }
           ].map((tile, i) => (
             <motion.div 
               key={i}
               initial={{ opacity: 0, y: 20 }}
               whileInView={{ opacity: 1, y: 0 }}
               transition={{ delay: i * 0.2 }}
               viewport={{ once: true }}
               className="p-12 rounded-[2.5rem] bg-white/[0.01] border border-white/[0.04] hover:bg-white/[0.03] transition-colors group"
             >
                <div className="text-primary/40 group-hover:text-primary transition-colors mb-8">
                  {tile.icon}
                </div>
                <h3 className="text-2xl font-medium mb-6">{tile.title}</h3>
                <p className="text-text-secondary/50 leading-relaxed font-light">
                  {tile.desc}
                </p>
             </motion.div>
           ))}
        </section>

        <footer className="mt-60 pb-20 opacity-20 text-[9px] font-bold tracking-[0.6em] uppercase text-center w-full">
           ETerapy &copy; 2026 • Путь к себе
        </footer>
      </main>
    </div>
  );
}
