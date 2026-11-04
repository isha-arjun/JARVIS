import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AudioLines, Brain, ChevronRight, Command, FlaskConical, History, Mic, MicOff, Radio, Send, Settings2, ShieldCheck, Sparkles, Trash2, Volume2 } from "lucide-react";
import CustomSimulator from "./CustomSimulator";
import { askGroqBrain, transcribeAudio } from "./engine/groqBrain";
import { runModel, type ModelSpec } from "./engine/universal";
import "./model-lab.css";

type SimKind = "ads" | "business" | "growth" | "pricing" | "project" | "funnel" | "risk" | "population";
type SimResult = { kind: SimKind; title: string; summary: string; metrics: { label: string; value: string; detail?: string }[]; chart: number[]; notes: string[]; assumptions: string[] };
type Message = { role: "assistant" | "user"; text: string; result?: SimResult };
type MemoryItem = { id: string; text: string; createdAt: number };
const simTypes: { id: SimKind; name: string; description: string; icon: string }[] = [
  { id: "ads", name: "Advertising & campaigns", description: "Spend, reach, clicks, conversions, CAC and ROAS", icon: "◉" },
  { id: "business", name: "Business & revenue", description: "Revenue, costs, margins, runway and break-even", icon: "↗" },
  { id: "growth", name: "Growth experiments", description: "Traffic, activation, retention and compounding", icon: "⌁" },
  { id: "pricing", name: "Pricing & monetization", description: "Price sensitivity, tiers, conversion and revenue", icon: "◇" },
  { id: "project", name: "Project & delivery", description: "Timelines, capacity, scope and schedule risk", icon: "▦" },
  { id: "funnel", name: "Conversion funnels", description: "Drop-offs, conversion rates and experiments", icon: "▽" },
  { id: "risk", name: "Risk & uncertainty", description: "Monte Carlo outcomes and sensitivity analysis", icon: "⌗" },
  { id: "population", name: "Agent & system dynamics", description: "Population, adoption and interacting agents", icon: "◎" }
];
const money = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
function detectKind(text: string): SimKind | null {
  const s = text.toLowerCase();
  if (/google ads|advertis|campaign|cpc|cpm|roas|ad spend/.test(s)) return "ads";
  if (/pricing|price|subscription|monetiz|tier/.test(s)) return "pricing";
  if (/funnel|conversion rate|checkout|landing page/.test(s)) return "funnel";
  if (/timeline|deadline|project plan|delivery|capacity|sprint/.test(s)) return "project";
  if (/population|agent-based|agents|epidemic|adoption model/.test(s)) return "population";
  if (/risk|uncertainty|probability|monte carlo|worst case/.test(s)) return "risk";
  if (/growth|traffic|retention|users|acquisition/.test(s)) return "growth";
  if (/revenue|profit|break even|break-even|business|runway|margin/.test(s)) return "business";
  return null;
}
function parseNumber(text: string, patterns: RegExp[], fallback: number) {
  for (const p of patterns) { const m = text.match(p); if (m) { const n = Number(m[1].replace(/,/g, "")); if (Number.isFinite(n)) return n; } }
  return fallback;
}
function buildExplicitCacAnswer(prompt: string, history: Message[] = []): string | null {
  const conversation = [...history.filter((m) => m.role === "user").map((m) => m.text), prompt].join("\n");
  const asksForCac = /\b(cac|customer acquisition cost|cost per customer)\b/i.test(prompt);
  const changesConversionRate = /\b(conversion rate|converts?)\b/i.test(prompt) && /\d+(?:\.\d+)?\s*%/.test(prompt);
  if (!asksForCac && !changesConversionRate) return null;
  const lastNumber = (pattern: RegExp): number | null => {
    const matches = [...conversation.matchAll(pattern)];
    const match = matches[matches.length - 1];
    if (!match) return null;
    const raw = match[1] || match[2];
    const value = Number(raw.replace(/,/g, ""));
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const spend = lastNumber(/(?:₹|rs\.?\s*)([\d,]+)|([\d,]+)\s*rupees?\b/gi);
  const clicks = lastNumber(/([\d,]+)\s*clicks?\b|\bclicks?\s*(?:of|at|to)?\s*([\d,]+)/gi);
  const conversionRate = lastNumber(/([\d]+(?:\.[\d]+)?)\s*%/gi);
  if (spend === null || clicks === null || conversionRate === null || conversionRate > 100) return null;
  const customers = clicks * conversionRate / 100;
  if (customers <= 0) return null;
  const cac = spend / customers;
  return [
    "Based on the figures in our conversation:",
    "",
    "- Ad spend: ₹" + money(spend),
    "- Clicks: " + money(clicks),
    "- Conversion rate: " + conversionRate + "%",
    "- Estimated paying customers: " + money(customers),
    "- **Customer acquisition cost (CAC): ₹" + cac.toFixed(2) + " per customer**",
    "",
    "Calculation: ₹" + money(spend) + " ÷ " + money(customers) + " customers = ₹" + cac.toFixed(2) + " CAC.",
    "This assumes the conversion rate represents clicks that become paying customers; it is an estimate, not measured campaign performance."
  ].join("\n");
}
function buildExplicitCacSimulation(prompt: string, history: Message[] = []): SimResult | null {
  const conversation = [...history.filter(m => m.role === "user").map(m => m.text), prompt].join("\\n");
  if (!/\\b(cac|customer acquisition cost|cost per customer)\\b/i.test(conversation)) return null;
  const last = (pattern: RegExp): number | null => {
    const matches = [...conversation.matchAll(pattern)];
    const match = matches[matches.length - 1];
    if (!match) return null;
    const raw = match[1] || match[2];
    const value = Number(raw.replace(/,/g, ""));
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const spend = last(/(?:₹|rs\\.?\\s*)([\\d,]+)|([\\d,]+)\\s*rupees?\\b/gi);
  const clicks = last(/([\\d,]+)\\s*clicks?\\b|\\bclicks?\\s*(?:of|at|to)?\\s*([\\d,]+)/gi);
  const rate = last(/(?:conversion rate|converts?)\\D{0,24}(\\d+(?:\\.\\d+)?)\\s*%/gi) ?? last(/(\\d+(?:\\.\\d+)?)\\s*%/g);
  const price = last(/(?:\\$|usd\\s*)(\\d+(?:\\.\\d+)?)/gi);
  if (spend === null || clicks === null || rate === null || price === null || rate > 100) return null;
  const scenarios = [Math.max(0.01, rate * 0.5), rate, Math.min(100, rate * 1.5)];
  const rows = scenarios.map((conversion, i) => {
    const customers = clicks * conversion / 100;
    return { name: ["Conservative", "Base case", "Optimistic"][i], rate: conversion, customers, cac: spend / customers, revenue: customers * price };
  });
  const base = rows[1];
  return {
    kind: "ads",
    title: "Customer acquisition cost — campaign simulation",
    summary: "A three-scenario acquisition model using your supplied spend, clicks, conversion rate and product price. Revenue is gross revenue before fees, refunds, taxes or other costs.",
    metrics: [
      { label: "Ad spend", value: "₹" + money(spend) },
      { label: "Estimated clicks", value: money(clicks) },
      { label: "Base-case customers", value: money(base.customers) },
      { label: "Base-case CAC", value: "₹" + base.cac.toFixed(2) },
      { label: "Product price", value: "$" + price.toFixed(2) },
      { label: "Base-case gross revenue", value: "$" + base.revenue.toFixed(2) },
    ],
    chart: rows.map(row => row.cac),
    notes: ["CAC = ad spend ÷ estimated paying customers.", "Customers = clicks × conversion rate.", "Revenue is shown in USD; ad spend and CAC are shown in INR. No currency conversion is assumed.", "This is a deterministic scenario comparison, not a forecast or measured campaign result."]
    ,assumptions: rows.map(row => row.name + ": " + row.rate.toFixed(2) + "% conversion; " + row.customers.toFixed(1) + " customers; CAC ₹" + row.cac.toFixed(2) + "; gross revenue $" + row.revenue.toFixed(2))
  };
}
function isIncompleteCacRequest(prompt: string, history: Message[] = []): string | null {
  const conversation = [...history.filter(m => m.role === "user").map(m => m.text), prompt].join(" ");
  if (!/\\b(cac|customer acquisition cost|cost per customer)\\b/i.test(conversation)) return null;
  if (!/(?:₹|rs\\.?\\s*|[\\d,]+\\s*rupees?)/i.test(conversation) || !/\\d[\\d,]*\\s*clicks?\\b/i.test(conversation)) return null;
  if (!/(?:conversion rate|converts?)\\D{0,24}\\d+(?:\\.\\d+)?\\s*%|\\d+(?:\\.\\d+)?\\s*%/i.test(conversation)) return "What conversion rate should I use for the CAC simulation?";
  if (!/(?:\\$|usd\\s*)\\d+(?:\\.\\d+)?/i.test(conversation)) return "What is the product price in USD? I need it to estimate gross revenue.";
  return null;
}
function buildExplicitAdsSimulation(prompt: string, history: Message[] = []): SimResult | null {
  const s = prompt.toLowerCase();
  const previousAds = [...history].reverse().find((m) => m.role === "assistant" && m.result?.kind === "ads")?.result;
  if (!/\\b(ad|ads|advertising|campaign|youtube|clicks?)\\b/.test(s) && !previousAds) return null;
  const budgetMatch = s.match(/(?:₹|rs\\.?\\s*|rupees?\\s*)([\\d,]+)|([\\d,]+)\\s*rupees?/i);
  const previousBudget = previousAds?.metrics.find((m) => m.label.toLowerCase() === "budget")?.value.match(/[\\d,.]+/)?.[0];
  const budget = budgetMatch ? Number((budgetMatch[1] || budgetMatch[2]).replace(/,/g, "")) : previousBudget ? Number(previousBudget.replace(/,/g, "")) : NaN;
  if (!Number.isFinite(budget) || budget <= 0) return null;
  const read = (m: RegExpMatchArray | null) => m ? Number((m[1] || m[2]).replace(/,/g, "")) : null;
  const conservative = read(s.match(/conservative(?:\\s+estimated)?\\s+clicks?\\D{0,24}([\\d,]+)/i));
  const optimistic = read(s.match(/optimistic(?:\\s+estimated)?\\s+clicks?\\D{0,24}([\\d,]+)/i));
  const balanced = read(s.match(/balanced(?:\\s+estimated)?\\s+clicks?\\D{0,24}([\\d,]+)/i));
  const generic = read(s.match(/(?:expected\\s+outcome|expected|estimated)?\\s*clicks?\\s*(?:(?:of|at|to)\\s+|[-:=]\\s*)?([\\d,]+)|([\\d,]+)\\s*clicks?/i));
  const rateMatch = s.match(/(?:conversion rate|converts?)\\D{0,18}(\\d+(?:\\.\\d+)?)\\s*%?/i);
  const rateInput = rateMatch ? Number(rateMatch[1]) : null;
  if ([conservative, optimistic, balanced, generic, rateInput].some((v) => v !== null && (!Number.isFinite(v) || v <= 0)) || (rateInput !== null && rateInput > 100)) return null;
  const previousBalancedText = previousAds?.metrics.find((m) => m.label.toLowerCase() === "balanced clicks")?.value.match(/[\\d,.]+/)?.[0];
  const fallback = generic ?? (previousBalancedText ? Number(previousBalancedText.replace(/,/g, "")) : null);
  const rangeGiven = conservative !== null || optimistic !== null;
  const low = conservative ?? (rangeGiven ? fallback ?? optimistic : fallback);
  const high = optimistic ?? (rangeGiven ? fallback ?? conservative : fallback);
  if (low === null) return null;
  const middle = balanced ?? (low + (high ?? low)) / 2;
  const clicks = [low, middle, high ?? middle];
  const names = ["Conservative", "Balanced", "Optimistic"];
  const rates = [rateInput ?? 1, rateInput ?? 2.5, rateInput ?? 4];
  const scenarios = clicks.map((count, i) => {
    const cpc = budget / count;
    const model: ModelSpec = { name: "Neon Aether " + names[i] + " ad scenario", formula: "clicks * conversion_rate", trials: 10000, variables: [
      { name: "clicks", distribution: { type: "fixed", value: count } },
      { name: "conversion_rate", distribution: { type: "uniform", min: Math.max(0, rates[i] * 0.5 / 100), max: Math.min(1, rates[i] * 1.5 / 100) } }
    ]};
    return { clicks: count, cpc, output: runModel(model) };
  });
  const mid = scenarios[1];
  return {
    kind: "ads",
    title: "Neon Aether — ₹" + money(budget) + " ad campaign simulations",
    summary: "Fixed-budget campaign model. Click estimates are inputs; CPC is calculated as budget divided by clicks. Target actions are modeled separately. Revenue and profit are not assumed.",
    metrics: [
      { label: "Budget", value: "₹" + money(budget) },
      { label: "Conservative clicks", value: money(scenarios[0].clicks) },
      { label: "Conservative CPC", value: "₹" + scenarios[0].cpc.toFixed(2) },
      { label: "Conservative target actions", value: scenarios[0].output.mean.toFixed(2) },
      { label: "Balanced clicks", value: money(mid.clicks) },
      { label: "Balanced CPC", value: "₹" + mid.cpc.toFixed(2) },
      { label: "Balanced target actions", value: mid.output.mean.toFixed(2) },
      { label: "Optimistic clicks", value: money(scenarios[2].clicks) },
      { label: "Optimistic CPC", value: "₹" + scenarios[2].cpc.toFixed(2) },
      { label: "Optimistic target actions", value: scenarios[2].output.mean.toFixed(2) },
      { label: "Balanced 5th–95th percentile", value: mid.output.p05.toFixed(2) + "–" + mid.output.p95.toFixed(2) }
    ],
    chart: mid.output.samples,
    notes: ["Illustrative planning model, not a YouTube forecast or guaranteed outcome.", "Click counts are fixed scenario inputs.", "Conversion rates (1%, 2.5%, 4%) are assumptions unless supplied by the user.", "No revenue or profit is calculated without explicit monetization assumptions.", "No campaign is created and no money is spent."],
    assumptions: ["Budget: ₹" + money(budget), "Three scenarios with 10,000 trials each", ...scenarios.map((item, i) => names[i] + ": " + money(item.clicks) + " clicks; CPC ₹" + item.cpc.toFixed(2) + "; target-action rate " + rates[i].toFixed(2) + "%"), "CPC = budget ÷ clicks.", rateInput !== null ? "Conversion rate supplied by user." : "Conversion rates are illustrative, not measured campaign data."]
  };
}
function simulate(kind: SimKind, prompt: string): SimResult {
  const s = prompt.toLowerCase();
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  if (kind === "ads") {
    const spend = parseNumber(s, [/(?:₹|rs\.?\s*)\s*([\d,]+)/, /(?:budget|spend|invest)\D{0,18}([\d,]+)/], 1000);
    const cpc = parseNumber(s, [/cpc\D{0,8}([\d.]+)/], 8);
    const rate = parseNumber(s, [/(?:conversion rate|converts?)\D{0,8}([\d.]+)/], 2.5) / 100;
    const aov = parseNumber(s, [/(?:order value|revenue per conversion|aov)\D{0,12}([\d,]+)/], 1200);
    const clicks = spend / Math.max(.1, cpc), conversions = clicks * rate, revenue = conversions * aov;
    const trials = Array.from({length: 4000}, () => { const cp = rand(cpc * .7, cpc * 1.4), cr = rand(rate * .45, rate * 1.7); return (spend / cp) * cr * aov - spend; }).sort((a,b)=>a-b);
    return { kind, title: "Advertising campaign simulation", summary: "A scenario model for paid acquisition. Replace the assumptions with real campaign benchmarks before making a decision.", metrics: [{label:"Estimated clicks",value:money(clicks)},{label:"Estimated conversions",value:conversions.toFixed(1)},{label:"Estimated revenue",value:"₹"+money(revenue)},{label:"ROAS",value:(revenue/spend).toFixed(2)+"×"},{label:"Chance of negative net return",value:(trials.filter(x=>x<0).length/40).toFixed(1)+"%"}], chart: Array.from({length:12},(_,i)=>Math.max(5,Math.round(20+Math.sin(i/2)*13+rand(0,28)))), notes:["This is a planning simulation, not a Google Ads forecast or a live campaign.","No ads are created, no money is spent, and no external account is accessed."], assumptions:["Budget: ₹"+money(spend),"Average CPC: ₹"+cpc.toFixed(2),"Conversion rate: "+(rate*100).toFixed(2)+"%","Revenue per conversion: ₹"+money(aov),"4,000 randomized scenarios vary CPC and conversion rate."] };
  }
  if (kind === "pricing") {
    const price = parseNumber(s, [/(?:₹|rs\.?\s*)\s*([\d,]+)/, /price\D{0,12}([\d,]+)/], 499);
    const visitors = parseNumber(s, [/([\d,]+)\s*(?:visitors|visits|users)/], 1000);
    const base = parseNumber(s, [/conversion\D{0,10}([\d.]+)/], 3) / 100;
    const scenarios = [price*.7,price,price*1.3].map(p=>({p,r:visitors*base*Math.pow(price/p,.65),rev:p*visitors*base*Math.pow(price/p,.65)}));
    return {kind,title:"Pricing & monetization simulation",summary:"Compares three price points using a simple price-elasticity assumption.",metrics:scenarios.map(x=>({label:"Price ₹"+x.p.toFixed(0),value:"₹"+money(x.rev),detail:Math.round(x.r)+" estimated buyers"})),chart:scenarios.map(x=>x.rev),notes:["Price elasticity is assumed, not measured. Real willingness-to-pay data is more reliable."],assumptions:["Visitors: "+money(visitors),"Baseline conversion: "+(base*100).toFixed(1)+"%","Elasticity coefficient: 0.65"]};
  }
  if (kind === "funnel") {
    const visitors=parseNumber(s,[/([\d,]+)\s*(?:visitors|traffic|sessions)/],10000), rates=[.35,.42,.28,.65];
    const stages=[visitors,visitors*rates[0],visitors*rates[0]*rates[1],visitors*rates[0]*rates[1]*rates[2],visitors*rates[0]*rates[1]*rates[2]*rates[3]];
    return {kind,title:"Conversion funnel simulation",summary:"A baseline funnel to identify where improving a stage could have the largest downstream effect.",metrics:stages.map((v,i)=>({label:["Visitors","Engaged","Sign-ups","Activated","Paid"][i],value:money(v),detail:i?((v/stages[i-1])*100).toFixed(1)+"% from previous stage":"100% of traffic"})),chart:stages,notes:["Stage rates are generic starting assumptions. Replace each with analytics data."],assumptions:["Traffic: "+money(visitors),"Engagement 35% · sign-up 42% · activation 28% · paid 65% of activated"]};
  }
  if (kind === "project") {
    const tasks=parseNumber(s,[/([\d]+)\s*(?:tasks|levels|features|deliverables)/],20), days=parseNumber(s,[/([\d]+)\s*days/],30), hours=parseNumber(s,[/([\d.]+)\s*hours?\s*(?:per day|\/day)/],2);
    const capacity=days*hours, effort=tasks*2.5, risk=clamp((effort/capacity-0.65)*100,5,95);
    return {kind,title:"Project delivery simulation",summary:"Estimates schedule pressure using task count, available work time and average effort.",metrics:[{label:"Estimated effort",value:effort.toFixed(0)+" hrs"},{label:"Available capacity",value:capacity.toFixed(0)+" hrs"},{label:"Capacity utilization",value:(effort/capacity*100).toFixed(1)+"%"},{label:"Schedule pressure",value:risk.toFixed(0)+" / 100"}],chart:Array.from({length:10},(_,i)=>Math.min(100,(i+1)*effort/Math.max(1,capacity)*10)),notes:["This simplified model assumes equal-sized tasks. Add task-level estimates for a useful schedule."],assumptions:["Tasks: "+tasks,"Time window: "+days+" days","Available time: "+hours+" hours/day","Average task effort: 2.5 hours"]};
  }
  if (kind === "population") {
    const agents=parseNumber(s,[/([\d,]+)\s*(?:agents|people|users)/],500), rounds=20; let active=agents*.04; const values:number[]=[];
    for(let i=0;i<rounds;i++){active=Math.min(agents,active+active*.22*(1-active/agents)-active*.035);values.push(active);}
    return {kind,title:"Agent adoption dynamics",summary:"A toy population model with adoption, saturation and churn. It does not represent real human behavior.",metrics:[{label:"Initial active agents",value:money(agents*.04)},{label:"Final active agents",value:money(active)},{label:"Final adoption",value:(active/agents*100).toFixed(1)+"%"},{label:"Rounds",value:String(rounds)}],chart:values,notes:["Abstract model only. No personal data or real-world population is involved."],assumptions:["Population: "+money(agents),"Initial adoption: 4%","Adoption coefficient: 0.22","Churn coefficient: 0.035"]};
  }
  if (kind === "risk") {
    const base=parseNumber(s,[/(?:expected|base|average)\D{0,12}(?:₹|rs\.?\s*)?([\d,]+)/],10000), cost=parseNumber(s,[/(?:cost|investment|budget)\D{0,12}(?:₹|rs\.?\s*)?([\d,]+)/],6000);
    const vals=Array.from({length:5000},()=>base*rand(.55,1.5)-cost).sort((a,b)=>a-b);
    return {kind,title:"Risk & uncertainty simulation",summary:"5,000 randomized outcomes estimate a range of possible results under the chosen uncertainty band.",metrics:[{label:"Average net outcome",value:"₹"+money(vals.reduce((a,b)=>a+b,0)/vals.length)},{label:"10th percentile",value:"₹"+money(vals[500])},{label:"Median",value:"₹"+money(vals[2500])},{label:"90th percentile",value:"₹"+money(vals[4500])},{label:"Negative outcomes",value:(vals.filter(x=>x<0).length/50).toFixed(1)+"%"}],chart:vals.filter((_,i)=>i%250===0),notes:["The probability distribution is illustrative and depends entirely on the supplied range."],assumptions:["Base outcome: ₹"+money(base),"Cost: ₹"+money(cost),"Outcome multiplier uniformly varies from 0.55× to 1.50×","5,000 trials"]};
  }
  if (kind === "growth") {
    const start=parseNumber(s,[/([\d,]+)\s*(?:users|visitors|customers)/],100), rate=parseNumber(s,[/(?:growth|grow)\D{0,10}([\d.]+)\s*%/],10)/100;
    const vals=Array.from({length:12},(_,i)=>start*Math.pow(1+rate,i+1));
    return {kind,title:"Growth trajectory simulation",summary:"Projects a simple compounding growth curve. Actual growth changes over time and is rarely constant.",metrics:[{label:"Starting users",value:money(start)},{label:"Monthly growth",value:(rate*100).toFixed(1)+"%"},{label:"Month 6",value:money(vals[5])},{label:"Month 12",value:money(vals[11])},{label:"12-month multiplier",value:(vals[11]/start).toFixed(2)+"×"}],chart:vals,notes:["A constant growth rate is a simplifying assumption, not a prediction."],assumptions:["Starting users: "+money(start),"Monthly growth: "+(rate*100).toFixed(1)+"%","Period: 12 months"]};
  }
  const revenue=parseNumber(s,[/(?:revenue|sales)\D{0,12}(?:₹|rs\.?\s*)?([\d,]+)/],50000),cost=parseNumber(s,[/(?:cost|expense|budget)\D{0,12}(?:₹|rs\.?\s*)?([\d,]+)/],30000);
  return {kind,title:"Business performance simulation",summary:"A baseline operating model. Adjust the assumptions to match the business you are analyzing.",metrics:[{label:"Revenue",value:"₹"+money(revenue)},{label:"Costs",value:"₹"+money(cost)},{label:"Net result",value:"₹"+money(revenue-cost)},{label:"Margin",value:(revenue?((revenue-cost)/revenue*100):0).toFixed(1)+"%"}],chart:Array.from({length:10},(_,i)=>Math.max(0,revenue-cost+rand(-cost*.25,cost*.25))),notes:["This model excludes tax, working capital, financing and other costs unless added to assumptions."],assumptions:["Revenue: ₹"+money(revenue),"Costs: ₹"+money(cost)]};
}
function speak(text:string):Promise<void>{
 if(!('speechSynthesis' in window)||!text.trim())return Promise.resolve();
 const synth=window.speechSynthesis;synth.cancel();
 const clean=text.replace(/\*\*(.*?)\*\*/g,'$1').replace(/\[(.*?)\]\([^)]*\)/g,'$1').replace(/[#*_]/g,'').replace(/\s+/g,' ').trim();
 const u=new SpeechSynthesisUtterance(clean);u.lang='en-GB';u.rate=.94;u.pitch=1.02;u.volume=1;
 const voices=synth.getVoices().filter(x=>/^en(-|_)/i.test(x.lang));
 const preferred=voices.find(x=>/\b(daniel|arthur|oliver|ryan|george|james)\b/i.test(x.name)&&!/female/i.test(x.name))
  ||voices.find(x=>/google uk english male|microsoft.*(ryan|guy|andrew)|natural.*male/i.test(x.name)&&!/female/i.test(x.name))
  ||voices.find(x=>/en-GB/i.test(x.lang)&&!/female/i.test(x.name))||voices[0];
 if(preferred)u.voice=preferred;
 return new Promise(resolve=>{u.onend=()=>resolve();u.onerror=()=>resolve();synth.speak(u);});
}
function wakeTokenDistance(a:string,b:string){
 const row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}
 return row[b.length];
}
function findWakePhrase(transcript:string){
 const words=transcript.toLowerCase().replace(/[^a-z' ]/g," ").split(/\s+/).filter(Boolean);
 const aliases=new Set(["jarvis","jervis","charvis","jarvus","travis","service"]);
 for(let i=0;i<words.length;i++){
  const word=words[i].replace(/'s$/,"");
  if(aliases.has(word)||wakeTokenDistance(word,"jarvis")<=1)return {index:i,words};
 }
 return null;
}
function ResultCard({result}:{result:SimResult}){const max=Math.max(1,...result.chart.map(Math.abs));return <div className="result-card"><div className="result-head"><span className="eyebrow">SIMULATION COMPLETE</span><span className="result-tag">ILLUSTRATIVE MODEL</span></div><h3>{result.title}</h3><p className="muted">{result.summary}</p><div className="metric-grid">{result.metrics.map(m=><div className="metric" key={m.label}><small>{m.label}</small><strong>{m.value}</strong>{m.detail&&<span>{m.detail}</span>}</div>)}</div><div className="chart"><div className="chart-label">SCENARIO PROFILE</div><div className="bars">{result.chart.map((v,i)=><div key={i} className="bar-wrap"><div className="bar" style={{height:Math.max(4,Math.abs(v)/max*100)+"%"}}/><small>{i+1}</small></div>)}</div></div><div className="result-columns"><div><b>Assumptions</b>{result.assumptions.map(x=><p key={x}>• {x}</p>)}</div><div><b>Limitations & safeguards</b>{result.notes.map(x=><p key={x}>• {x}</p>)}</div></div></div>}
export default function Workbench(){
 const [messages,setMessages]=useState<Message[]>([{role:"assistant",text:"Good evening. All systems are online. I can model campaigns, businesses, growth, pricing, delivery plans, funnels, risk and complex systems. Tell me what you would like to explore."}]);
 const [prompt,setPrompt]=useState(""); const [tab,setTab]=useState("Command"); const [memories,setMemories]=useState<MemoryItem[]>([]); const [memoryDraft,setMemoryDraft]=useState(""); const [memoryLoaded,setMemoryLoaded]=useState(false); const [listening,setListening]=useState(false); const [speaking,setSpeaking]=useState(false); const [wake,setWake]=useState(true); const [error,setError]=useState(""); const [selected,setSelected]=useState<SimKind>("ads"); const [brainStatus,setBrainStatus]=useState("NOT TESTED"); const [busy,setBusy]=useState(false); const [transcribing,setTranscribing]=useState(false); const recognition=useRef<any>(null); const wakeEnabled=useRef(false); const wakeBusy=useRef(false); const wakeRestartTimer=useRef<number|null>(null); const wakeResume=useRef<()=>void>(()=>{}); const recorder=useRef<MediaRecorder|null>(null); const stream=useRef<MediaStream|null>(null); const audioChunks=useRef<Blob[]>([]); const silenceMonitor=useRef<number|null>(null); const audioContext=useRef<any>(null); const speechDetected=useRef(false); const lastSpeechAt=useRef(0); const input=useRef<HTMLTextAreaElement>(null);
 const Speech=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
 const latest=messages[messages.length-1];
 useEffect(()=>{try{const raw=localStorage.getItem("jarvis.memory.v1");if(raw){const parsed=JSON.parse(raw);if(Array.isArray(parsed))setMemories(parsed.filter((item:any)=>item&&typeof item.id==="string"&&typeof item.text==="string").slice(0,50));}}catch{setError("Saved memory could not be read. You can still add new memories.");}finally{setMemoryLoaded(true);}},[]);
 useEffect(()=>{if(memoryLoaded){try{localStorage.setItem("jarvis.memory.v1",JSON.stringify(memories));}catch{setError("Browser storage is full. Remove some memories and try again.");}}},[memories,memoryLoaded]);
 const addMemory=(value:string)=>{const text=value.trim().slice(0,500);if(!text)return;setMemories(current=>[{id:typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():String(Date.now()),text,createdAt:Date.now()},...current.filter(item=>item.text.toLowerCase()!==text.toLowerCase())].slice(0,50));};
 const speakResponse=(text:string)=>{setSpeaking(true);void speak(text).finally(()=>setSpeaking(false));};
 const addAssistantMessage=(message:Message)=>{setMessages(m=>[...m,message]);speakResponse(message.text);};
 useEffect(()=>{speakResponse(messages[0].text);},[]);
 const send=async(value=prompt)=>{const q=value.trim();if(!q||busy)return;setError("");setBusy(true);setMessages(m=>[...m,{role:"user",text:q}]);setPrompt("");setTab("Command");try{
  const rememberMatch=q.match(/^(?:jarvis[, ]*)?(?:please )?remember(?: that)?\s+(.+)$/i);
  if(rememberMatch){addMemory(rememberMatch[1]);addAssistantMessage({role:"assistant",text:"Got it. I've saved that to your personal memory on this device."});return;}
  if(/^(?:jarvis[, ]*)?(?:what do you remember|show my memories|list my memories|what have you remembered)(?: about me)?\??$/i.test(q)){addAssistantMessage({role:"assistant",text:memories.length?"Here is what I currently remember:\n\n"+memories.map((item,i)=>(i+1)+". "+item.text).join("\n"):"I don't have any saved memories yet. Tell me “remember that…” to save something."});return;}
  if(/^(?:jarvis[, ]*)?(?:forget everything|forget all my memories|clear my memory)\.?$/i.test(q)){setMemories([]);addAssistantMessage({role:"assistant",text:"Your saved JARVIS memories on this device have been cleared."});return;}
  const forgetMatch=q.match(/^(?:jarvis[, ]*)?forget(?: about)?\s+(.+)$/i);
  if(forgetMatch){const target=forgetMatch[1].trim().toLowerCase();const matched=memories.some(item=>item.text.toLowerCase().includes(target));setMemories(current=>current.filter(item=>!item.text.toLowerCase().includes(target)));addAssistantMessage({role:"assistant",text:matched?"Removed the matching saved memory.":"I couldn't find a saved memory matching that phrase."});return;}
  const cacSimulation = buildExplicitCacSimulation(q, messages);
  if (cacSimulation) {
    setBrainStatus("LOCAL SIMULATION");
    addAssistantMessage({role:"assistant",text:"I've run the CAC scenarios directly from your inputs, without relying on generated formulas.",result:cacSimulation});
    return;
  }
  const cacClarification = isIncompleteCacRequest(q, messages);
  if (cacClarification) {
    setBrainStatus("NEEDS INPUT");
    addAssistantMessage({role:"assistant",text:cacClarification});
    return;
  }
  const explicitCac = buildExplicitCacAnswer(q, messages);
  if (explicitCac) {
    setBrainStatus("LOCAL CALCULATION");
    addAssistantMessage({role:"assistant",text:explicitCac});
    return;
  }
  const explicitAds = buildExplicitAdsSimulation(q, messages);
  if (explicitAds) {
    setBrainStatus("CONNECTED");
    addAssistantMessage({role:"assistant",text:"I've extracted the campaign inputs directly and run a validated simulation.",result:explicitAds});
    return;
  }
  const decision=await askGroqBrain(q,messages.slice(-8),memories.map(item=>item.text));setBrainStatus("CONNECTED");
  if(decision.type==="answer"||decision.type==="clarify"){addAssistantMessage({role:"assistant",text:decision.reply});return;}
  const modelResult=runModel(decision.model as ModelSpec);
  const result:SimResult={kind:detectKind(q)||"risk",title:modelResult.name,summary:decision.reply+" This is a randomized model based on the generated assumptions, not a prediction.",metrics:[{label:"Expected outcome",value:money(modelResult.mean)},{label:"Median outcome",value:money(modelResult.median)},{label:"5th percentile",value:money(modelResult.p05)},{label:"95th percentile",value:money(modelResult.p95)},{label:"Positive outcomes",value:(modelResult.probabilityPositive*100).toFixed(1)+"%"},{label:"Negative outcomes",value:(modelResult.probabilityNegative*100).toFixed(1)+"%"}],chart:modelResult.samples,notes:["Generated by Groq from the supplied assumptions. Validate assumptions before relying on the result.","Monte Carlo outputs are conditional on the selected distributions; they are not guarantees."],assumptions:[modelResult.formula,...(decision.model.variables||[]).map((v:any)=>v.name+": "+JSON.stringify(v.distribution)),modelResult.trials.toLocaleString("en-IN")+" trials"]};
  addAssistantMessage({role:"assistant",text:"I've interpreted your request and constructed a custom simulation. Here are the results and assumptions.",result});return;
 }catch(e){addAssistantMessage({role:"assistant",text:e instanceof Error?e.message:"I couldn't process that request."});}finally{setBusy(false);}};
 const clearSilenceMonitor=()=>{if(silenceMonitor.current!==null){window.clearInterval(silenceMonitor.current);silenceMonitor.current=null;}if(audioContext.current){void audioContext.current.close().catch(()=>{});audioContext.current=null;}speechDetected.current=false;};
 const startVoice=async()=>{if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){setError("Audio recording is unavailable in this browser. Try a recent version of Chrome or Edge.");return;}try{const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});stream.current=media;audioChunks.current=[];speechDetected.current=false;lastSpeechAt.current=0;let ambientRms=0.006;const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":MediaRecorder.isTypeSupported("audio/webm")?"audio/webm":"";const rec=new MediaRecorder(media,mime?{mimeType:mime}:undefined);recorder.current=rec;rec.ondataavailable=(event)=>{if(event.data.size>0)audioChunks.current.push(event.data)};rec.onerror=()=>{clearSilenceMonitor();setError("Microphone recording failed. Please try again.");setListening(false);setTranscribing(false);if(wakeBusy.current)wakeResume.current()};rec.onstop=async()=>{clearSilenceMonitor();setListening(false);media.getTracks().forEach(track=>track.stop());stream.current=null;const audio=new Blob(audioChunks.current,{type:rec.mimeType||"audio/webm"});audioChunks.current=[];if(!audio.size){setError("No audio was captured.");if(wakeBusy.current)wakeResume.current();return;}setTranscribing(true);setError("");try{const text=await transcribeAudio(audio);if(!text.trim()){setError("I couldn't detect any speech. Please try again.");return;}await send(text);}catch(e){setError(e instanceof Error?e.message:"Transcription failed.");}finally{setTranscribing(false);if(wakeBusy.current)wakeResume.current();}};rec.start(250);setListening(true);setError("");
  // Monitor microphone energy. Once speech is detected, 10 seconds of continuous
  // low audio energy ends the recording and automatically transcribes/submits it.
  try{const AudioContextCtor=(window as any).AudioContext||(window as any).webkitAudioContext;if(AudioContextCtor){const ctx=new AudioContextCtor();audioContext.current=ctx;const source=ctx.createMediaStreamSource(media);const analyser=ctx.createAnalyser();analyser.fftSize=2048;source.connect(analyser);const samples=new Float32Array(analyser.fftSize);silenceMonitor.current=window.setInterval(()=>{if(recorder.current!==rec||rec.state!=="recording")return;analyser.getFloatTimeDomainData(samples);let sum=0;for(let i=0;i<samples.length;i++)sum+=samples[i]*samples[i];const rms=Math.sqrt(sum/samples.length);const speechThreshold=Math.max(0.018,ambientRms*2.2);if(!speechDetected.current&&rms<0.04){ambientRms=ambientRms*0.92+rms*0.08;}if(rms>speechThreshold){speechDetected.current=true;lastSpeechAt.current=Date.now();}if(speechDetected.current&&Date.now()-lastSpeechAt.current>=3000)stopVoice();},250);}}catch{/* Recording still works; manual stop remains available if audio analysis is unsupported. */}
 }catch(e){clearSilenceMonitor();setError(e instanceof Error&&e.name==="NotAllowedError"?"Microphone permission is blocked. Allow microphone access in your browser settings.":"Could not access the microphone.");setListening(false);if(wakeBusy.current)wakeResume.current();}};
 const stopVoice=()=>{clearSilenceMonitor();try{if(recorder.current&&recorder.current.state!=="inactive")recorder.current.stop();else setListening(false);}catch{setListening(false)}};
 useEffect(()=>{
  wakeEnabled.current=wake;
  if(!wake){
    if(wakeRestartTimer.current!==null)window.clearTimeout(wakeRestartTimer.current);
    wakeRestartTimer.current=null;
    wakeResume.current=()=>{};
    try{recognition.current?.abort()}catch{}
    recognition.current=null;
    return;
  }
  if(!Speech){setError("Wake phrase recognition is unavailable in this browser. Use a supported browser or the microphone button.");setWake(false);return;}
  wakeBusy.current=false;
  let disposed=false;
  let r:any;
  const scheduleRestart=()=>{
    if(disposed||!wakeEnabled.current||wakeBusy.current||wakeRestartTimer.current!==null)return;
    wakeRestartTimer.current=window.setTimeout(()=>{
      wakeRestartTimer.current=null;
      if(disposed||!wakeEnabled.current||wakeBusy.current)return;
      try{r.start()}catch{/* The browser may still be transitioning; onend will schedule another attempt. */}
    },1000);
  };
  wakeResume.current=()=>{wakeBusy.current=false;scheduleRestart();};
  try{
    r=new Speech();recognition.current=r;r.lang="en-IN";r.continuous=true;r.interimResults=true;r.maxAlternatives=3;
    r.onresult=(e:any)=>{
      if(wakeBusy.current)return;
      for(let i=Math.max(0,e.resultIndex-1);i<e.results.length;i++){
        const result=e.results[i];
        const alternatives=Array.from(result as any) as any[];
        const heard=alternatives.map((alt:any)=>String(alt.transcript||"")).find(Boolean)||"";
        const wakeMatch=findWakePhrase(heard);
        if(!wakeMatch)continue;
        wakeBusy.current=true;
        const command=wakeMatch.words.slice(wakeMatch.index+1).join(" ").trim();
        try{r.stop()}catch{}
        if(command.length>2){
          speak("Certainly.");
          send(command).finally(()=>wakeResume.current());
        }else{
          // Wait for JARVIS's spoken prompt to finish before opening the microphone,
          // otherwise Deepgram can transcribe JARVIS itself as the user's command.
          void speak("I'm listening. Go ahead.").then(()=>{
            if(wakeEnabled.current&&wakeBusy.current)window.setTimeout(()=>startVoice(),350);
          });
        }
        break;
      }
    };
    r.onerror=(e:any)=>{
      const fatal=["not-allowed","service-not-allowed","audio-capture"].includes(e.error);
      if(fatal){setError("Wake phrase listening needs microphone permission and an available speech-recognition service ("+e.error+").");setWake(false);}
      // no-speech, network interruptions and browser timeouts are retried by onend.
    };
    r.onend=()=>{if(!disposed&&wakeEnabled.current&&!wakeBusy.current)scheduleRestart();};
    r.start();
  }catch{
    setError("Could not start wake phrase recognition. Check microphone permission and try again.");
    setWake(false);
  }
  return()=>{
    disposed=true;
    if(wakeRestartTimer.current!==null)window.clearTimeout(wakeRestartTimer.current);
    wakeRestartTimer.current=null;
    wakeResume.current=()=>{};
    try{r?.abort()}catch{}
    if(recognition.current===r)recognition.current=null;
  };
},[wake]);
 useEffect(()=>()=>{try{recognition.current?.abort()}catch{}try{recorder.current?.stop()}catch{}stream.current?.getTracks().forEach(track=>track.stop());window.speechSynthesis?.cancel()},[]);
 const nav=[{name:"Command",icon:Command},{name:"Memory",icon:Brain},{name:"Simulations",icon:FlaskConical},{name:"Model Lab",icon:FlaskConical},{name:"Activity",icon:History},{name:"Settings",icon:Settings2}];
 return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><AudioLines size={20}/></div><div><b>JARVIS</b><small>PERSONAL INTELLIGENCE</small></div></div><div className="side-caption">WORKSPACE</div>{nav.map(n=><button key={n.name} className={"nav-item "+(tab===n.name?"active":"")} onClick={()=>setTab(n.name)}><n.icon size={17}/>{n.name}<ChevronRight size={14}/></button>)}<div className="sidebar-bottom"><div className="status-orb"><span/>CORE STANDBY</div><small>LOCAL SIMULATION ENGINE</small><small>BUILD 0.1 · PREVIEW</small></div></aside><main className="main-area"><header className="topbar"><div><span className="crumb">JARVIS</span><span className="slash">/</span>{tab}</div><div className="top-status"><span/> SYSTEM NOMINAL <button title="Toggle speech wake phrase while JARVIS is running" onClick={()=>setWake(!wake)} className={wake?"wake active":"wake"}><Radio size={15}/>{wake?"WAKE MODE ON":"WAKE MODE OFF"}</button></div></header>
 {tab==="Command"&&<div className="command-page"><div className="welcome"><div className="eyebrow"><Sparkles size={13}/> PERSONAL AI / READY</div><h1>At your command.</h1><p>Think out loud. Ask questions. Run simulations. I'll help turn the idea into a model you can inspect.</p></div><section className="conversation">{messages.map((m,i)=><div key={i} className={"message "+m.role}><div className="avatar">{m.role==="assistant"?<AudioLines size={16}/>: "YOU"}</div><div className="message-body"><div className="message-label">{m.role==="assistant"?"JARVIS":"YOU"}</div><p>{m.text}</p>{m.result&&<ResultCard result={m.result}/>}</div>{m.role==="assistant"&&<button className="icon-button speak" title="Read response aloud" onClick={()=>speakResponse(m.text)}><Volume2 size={15}/></button>}</div>)}</section><div className="composer-wrap"><div className="composer"><textarea ref={input} rows={2} value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}} placeholder={busy?"JARVIS is thinking…":"JARVIS, ask or simulate anything…"}/><div className="composer-actions"><div><button className={"icon-button mic "+(listening?"recording":"")} disabled={transcribing} onClick={listening?stopVoice:startVoice} title={listening?"Stop listening":"Speak a command"}>{listening?<MicOff size={17}/>:<Mic size={17}/>}</button><span className="hint">{listening?"RECORDING…":transcribing?"TRANSCRIBING WITH DEEPGRAM…":"VOICE OR TEXT · SHIFT + ENTER FOR NEW LINE"}</span></div><button className="send-button" onClick={()=>send()} disabled={!prompt.trim()||busy}><Send size={16}/> {busy?"Thinking…":"Run command"}</button></div></div>{error&&<p className="error">{error}</p>}<div className="quick-prompts"><span>TRY</span>{["Simulate ₹2,000 in Google Ads","Model a 20% monthly growth rate","Compare pricing at ₹299, ₹499 and ₹799","Estimate a 30-day project schedule"].map(x=><button key={x} onClick={()=>send(x)}>{x}</button>)}</div></div></div>}
 {tab==="Memory"&&<div className="section-page"><div className="eyebrow">PERSONAL CONTEXT / DEVICE-LOCAL</div><h1>What JARVIS remembers.</h1><p className="muted">Only facts you explicitly save are stored. Memories stay in this browser on this device and are sent to the JARVIS brain as context when you chat. They are not synced to an account.</p><div className="settings-card"><div style={{width:"100%"}}><b>Add a memory</b><p>Examples: “Neon Aether is planned for February 10, 2027.” or “I prefer free tools.”</p><textarea value={memoryDraft} onChange={e=>setMemoryDraft(e.target.value)} rows={3} maxLength={500} placeholder="A fact JARVIS should remember…"/><button className="secondary-button" disabled={!memoryDraft.trim()} onClick={()=>{addMemory(memoryDraft);setMemoryDraft("");}}>Save memory</button></div></div><div className="memory-list">{memories.length?memories.map(item=><div className="settings-card" key={item.id}><div><b>{item.text}</b><p>Saved {new Date(item.createdAt).toLocaleDateString()}</p></div><button className="icon-button" title="Delete this memory" onClick={()=>setMemories(current=>current.filter(x=>x.id!==item.id))}><Trash2 size={16}/></button></div>):<div className="empty">No saved memories yet. Add one here or tell JARVIS “remember that…”</div>}</div>{memories.length>0&&<button className="secondary-button" onClick={()=>{if(window.confirm("Clear every saved JARVIS memory on this device?"))setMemories([]);}}>Clear all memories</button>}</div>}
 {tab==="Simulations"&&<div className="section-page"><div className="eyebrow">MODEL LIBRARY / 08 ENGINES</div><h1>Choose a simulation.</h1><p className="muted">Start with a model. JARVIS can then help refine the assumptions in natural language.</p><div className="sim-grid">{simTypes.map(t=><button className={"sim-tile "+(selected===t.id?"selected":"")} key={t.id} onClick={()=>{setSelected(t.id);setPrompt("Run a "+t.name.toLowerCase()+" simulation");setTab("Command");input.current?.focus()}}><span className="tile-symbol">{t.icon}</span><b>{t.name}</b><p>{t.description}</p><span className="tile-cta">CONFIGURE <ChevronRight size={13}/></span></button>)}</div><div className="notice"><ShieldCheck size={18}/><p><b>Simulation safety</b><br/>These models run locally in your browser using illustrative assumptions. They do not spend money, place trades, launch campaigns or change external accounts.</p></div></div>}
 {tab==="Model Lab"&&<div className="section-page"><CustomSimulator/></div>}{tab==="Activity"&&<div className="section-page"><div className="eyebrow">SESSION LOG</div><h1>Recent activity.</h1><p className="muted">Your current session's commands and simulation outputs.</p><div className="activity-list">{messages.filter(m=>m.role==="user").map((m,i)=><div key={i}><span>{String(i+1).padStart(2,"0")}</span><p>{m.text}</p><small>{messages.filter(x=>x.role==="assistant"&&x.result)[i]?.result?.title||"Command processed"}</small></div>)}</div>{messages.length===1&&<p className="empty">No commands yet. Start with a simulation in the Command Center.</p>}</div>}
 {tab==="Settings"&&<div className="section-page"><div className="eyebrow">PREFERENCES & PERMISSIONS</div><h1>System settings.</h1><div className="settings-card"><div><b>Voice personality</b><p>British English · confident delivery · natural pacing</p></div><span className="setting-pill">JARVIS STYLE</span></div><div className="settings-card"><div><b>Wake phrase</b><p>Wake mode starts automatically when JARVIS opens. Say “JARVIS” while this interface is open. The desktop companion can keep its window running in the background, but wake detection depends on browser speech-recognition support and microphone permission.</p></div><span className="setting-pill muted-pill">BROWSER SPEECH</span></div><div className="settings-card brain-settings"><div><b>Groq cloud brain</b><p>JARVIS uses Groq for reasoning and Deepgram Nova-3 for speech-to-text. Your API key stays on the server in Vercel and is never sent to the browser. Chat model: openai/gpt-oss-20b · Speech recognition: Deepgram Nova-3.</p><button className="secondary-button" onClick={async()=>{setBrainStatus("CONNECTING");try{await askGroqBrain("Reply with a brief greeting confirming the JARVIS connection is online.");setBrainStatus("CONNECTED");setError("");}catch(e){setBrainStatus("OFFLINE");setError(e instanceof Error?e.message:"Groq connection test failed.");}}}>Test Groq connection</button></div><span className="setting-pill muted-pill">{brainStatus}</span></div><div className="settings-card"><div><b>Privacy</b><p>Microphone access starts only after you explicitly enable wake mode or press the voice button. Microphone recordings are sent securely to Deepgram Nova-3 for transcription only after you press the microphone button and stop recording. JARVIS does not save audio recordings.</p></div><span className="setting-pill">OPT-IN</span></div><button className="secondary-button" onClick={()=>speakResponse("Good evening. All systems are standing by.")}><Volume2 size={16}/> Test voice</button></div>}
 <footer><span>JARVIS PERSONAL INTELLIGENCE</span><span>SIMULATIONS ARE ILLUSTRATIVE · NO EXTERNAL ACTIONS</span></footer></main></div>;
}
