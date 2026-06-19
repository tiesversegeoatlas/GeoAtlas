"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Globe, ArrowRight, Shield, Activity, Map as MapIcon } from "lucide-react";
import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative min-h-[95vh] flex flex-col items-center justify-center text-center px-4 overflow-hidden py-20">
      {/* Background Grid & Patterns */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20" />
      
      {/* Abstract Tech Patterns */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] mix-blend-overlay" />
      </div>

      {/* Glow Effects */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] -z-10 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-critical/10 rounded-full blur-[120px] -z-10 animate-pulse [animation-delay:2s]" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 space-y-8 max-w-5xl"
      >
        <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black tracking-[0.2em] uppercase shadow-lg shadow-primary/5">
          <Activity className="w-3.5 h-3.5 animate-pulse" />
          Tactical Awareness: Activated
        </div>
        
        <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-white leading-[0.9] uppercase">
          Precision <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-blue-400 to-primary bg-[length:200%_auto] animate-gradient">
            Geo-Intelligence
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-medium">
          The ultimate strategic monitoring platform for conflict tracking, risk assessment, and global situational awareness. Built for those who need to see the world before it changes.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-8">
          <Button asChild size="lg" className="h-14 px-10 text-sm font-black uppercase tracking-widest group bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20">
            <Link href="/feed">
              Access Live Feed
              <ArrowRight className="ml-3 w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-14 px-10 text-sm font-black uppercase tracking-widest border-border bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all">
            <Link href="/map">
              <MapIcon className="mr-3 w-4 h-4" />
              Global Operations Map
            </Link>
          </Button>
        </div>

        {/* Tactical Metadata Footer in Hero */}
        <div className="pt-12 flex flex-wrap justify-center gap-x-12 gap-y-6 opacity-40">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Latency</span>
            <span className="text-xs font-mono font-bold text-low">14ms</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Uptime</span>
            <span className="text-xs font-mono font-bold text-low">99.99%</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Sources</span>
            <span className="text-xs font-mono font-bold text-white">Verified OSINT</span>
          </div>
        </div>
      </motion.div>

      {/* Decorative Icons Floating */}
      <motion.div 
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/3 left-10 md:left-20 hidden lg:block p-4 rounded-2xl glass"
      >
        <Shield className="w-8 h-8 text-primary" />
      </motion.div>
      
      <motion.div 
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-1/3 right-10 md:right-20 hidden lg:block p-4 rounded-2xl glass"
      >
        <Globe className="w-8 h-8 text-low" />
      </motion.div>
    </section>
  );
}
