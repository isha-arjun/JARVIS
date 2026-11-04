import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AudioLines, ChevronRight, Command, FlaskConical, History, Mic, MicOff, Radio, Send, Settings2, ShieldCheck, Sparkles, Volume2 } from "lucide-react";
import CustomSimulator from "./CustomSimulator";
import { askGroqBrain, transcribeAudio } from "./engine/groqBrain";
import { runModel, type ModelSpec } from "./engine/universal";
import "./model-lab.css";

type SimKind = "ads" | "business" | "growth" | "pricing" | "project" | "funnel" | "risk" | "population";
type SimResult = { kind: SimKind; title: string; summary: string; metrics: { label: string; value: string; detail?: string }[]; chart: number[]; notes: string[]; assumptions: string[] };
type Message = { role: "assistant" | "user"; text: string; result?: SimResult };
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
function buildExplicitAdsSimulation(prompt: string): SimResult | null {
  const s = prompt.toLowerCase();
  if (!/\b(ad|ads|advertising|campaign)\b/.test(s)) return null;

  const budgetMatch = s.match(/(?:₹|rs\.?\s*|rupees?\s*)([\d,]+)|([\d,]+)\s*rupees?/i);
  if (!budgetMatch) return null;
  const budget = Number((budgetMatch[1] || budgetMatch[2]).replace(/,/g, ""));
  if (!Number.isFinite(budget) || budget <= 0) return null;

  const clicksMatch = s.match(/(?:around|about|approximately|roughly)?\s*(?:a\s*)?([\d,]+)\s*clicks?/i);
  const cpcMatch = s.match(/(?:cpc|cost per click)\D{0,12}(?:₹|rs\.?\s*)?([\d,.]+)/i);
  const rateMatch = s.match(/(?:conversion rate|converts?)\D{0,18}(\d+(?:\.\d+)?)\s*%?/i);
  const statedClicks = clicksMatch ? Number(clicksMatch[1].replace(/,/g, "")) : null;
  const statedCpc = cpcMatch ? Number(cpcMatch[1].replace(/,/g, "")) : null;
  const statedRate = rateMatch ? Number(rateMatch[1]) : null;
  if ((statedClicks !== null && (!Number.isFinite(statedClicks) || statedClicks <= 0)) ||
      (statedCpc !== null && (!Number.isFinite(statedCpc) || statedCpc <= 0)) ||
      (statedRate !== null && (!Number.isFinite(statedRate) || statedRate < 0 || statedRate > 100))) return null;

  const scenarios = [
    { name: "Conservative", cpc: statedCpc || (statedClicks ? budget / statedClicks * 1.25 : 12), rate: statedRate ?? 1 },
    { name: "Balanced", cpc: statedCpc || (statedClicks ? budget / statedClicks : 8), rate: statedRate ?? 2.5 },
    { name: "Optimistic", cpc: statedCpc || (statedClicks ? budget / statedClicks * 0.75 : 5), rate: statedRate ?? 4 }
  ];
  const results = scenarios.map((scenario) => {
    const estimatedClicks = statedClicks || budget / scenario.cpc;
    const model: ModelSpec = {
      name: "Neon Aether " + scenario.name + " ad scenario",
      formula: "clicks * conversion_rate",
      trials: 10000,
      variables: [
        { name: "clicks", distribution: { type: "uniform", min: estimatedClicks * 0.8, max: estimatedClicks * 1.2 } },
        { name: "conversion_rate", distribution: { type: "uniform", min: Math.max(0, scenario.rate * 0.5 / 100), max: Math.min(1, scenario.rate * 1.5 / 100) } }
      ]
    };
    return { scenario, estimatedClicks, output: runModel(model) };
  });
  const balanced = results[1];
  const explicitClicks = statedClicks !== null && statedClicks > 0;
  const assumptions = [
    "Campaign budget: ₹" + money(budget),
    "Three scenarios, each with 10,000 Monte Carlo trials",
    "Conservative: CPC ₹" + scenarios[0].cpc.toFixed(2) + ", target-action rate " + scenarios[0].rate.toFixed(2) + "%",
    "Balanced: CPC ₹" + scenarios[1].cpc.toFixed(2) + ", target-action rate " + scenarios[1].rate.toFixed(2) + "%",
    "Optimistic: CPC ₹" + scenarios[2].cpc.toFixed(2) + ", target-action rate " + scenarios[2].rate.toFixed(2) + "%",
    explicitClicks ? "Click volume supplied by user; CPC scenarios are illustrative." : "Click volumes are estimated from the scenario CPC assumptions.",
    statedRate !== null ? "Conversion rate supplied by user." : "Conversion rates are illustrative planning assumptions, not measured Neon Aether campaign data."
  ];

  return {
    kind: "ads",
    title: "Neon Aether — ₹" + money(budget) + " ad campaign simulations",
    summary: "I ran three planning scenarios for a small Neon Aether campaign. 'Target actions' could mean a website visit that leads to a wishlist signup or another goal you choose; these are not guaranteed outcomes.",
    metrics: [
      { label: "Budget", value: "₹" + money(budget) },
      { label: "Conservative clicks", value: money(results[0].estimatedClicks) },
      { label: "Conservative target actions", value: results[0].output.mean.toFixed(2) },
      { label: "Balanced clicks", value: money(results[1].estimatedClicks) },
      { label: "Balanced target actions", value: balanced.output.mean.toFixed(2) },
      { label: "Optimistic clicks", value: money(results[2].estimatedClicks) },
      { label: "Optimistic target actions", value: results[2].output.mean.toFixed(2) },
      { label: "Balanced 5th–95th percentile", value: balanced.output.p05.toFixed(2) + "–" + balanced.output.p95.toFixed(2) }
    ],
    chart: balanced.output.samples,
    notes: [
      "Illustrative scenarios only—not a forecast, platform quote, or promise of results.",
      "Actual performance depends on platform, audience, creative, bidding, landing page and campaign objective.",
      "No ad campaign is created, no account is accessed, and no money is spent."
    ],
    assumptions
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
function speak(text:string){if(!("speechSynthesis" in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang="en-GB";u.rate=.92;u.pitch=.88;const voices=window.speechSynthesis.getVoices();const v=voices.find(x=>/en-GB/i.test(x.lang)&&/male|daniel|george|oliver/i.test(x.name))||voices.find(x=>/en-GB/i.test(x.lang));if(v)u.voice=v;window.speechSynthesis.speak(u);}
function ResultCard({result}:{result:SimResult}){const max=Math.max(1,...result.chart.map(Math.abs));return <div className="result-card"><div className="result-head"><span className="eyebrow">SIMULATION COMPLETE</span><span className="result-tag">ILLUSTRATIVE MODEL</span></div><h3>{result.title}</h3><p className="muted">{result.summary}</p><div className="metric-grid">{result.metrics.map(m=><div className="metric" key={m.label}><small>{m.label}</small><strong>{m.value}</strong>{m.detail&&<span>{m.detail}</span>}</div>)}</div><div className="chart"><div className="chart-label">SCENARIO PROFILE</div><div className="bars">{result.chart.map((v,i)=><div key={i} className="bar-wrap"><div className="bar" style={{height:Math.max(4,Math.abs(v)/max*100)+"%"}}/><small>{i+1}</small></div>)}</div></div><div className="result-columns"><div><b>Assumptions</b>{result.assumptions.map(x=><p key={x}>• {x}</p>)}</div><div><b>Limitations & safeguards</b>{result.notes.map(x=><p key={x}>• {x}</p>)}</div></div></div>}
export default function Workbench(){
 const [messages,setMessages]=useState<Message[]>([{role:"assistant",text:"Good evening. JARVIS systems are online. I can model campaigns, businesses, growth, pricing, delivery plans, funnels, risk and complex systems. Tell me what you would like to explore."}]);
 const [prompt,setPrompt]=useState(""); const [tab,setTab]=useState("Command"); const [listening,setListening]=useState(false); const [speaking,setSpeaking]=useState(false); const [wake,setWake]=useState(false); const [error,setError]=useState(""); const [selected,setSelected]=useState<SimKind>("ads"); const [brainStatus,setBrainStatus]=useState("NOT TESTED"); const [busy,setBusy]=useState(false); const [transcribing,setTranscribing]=useState(false); const recognition=useRef<any>(null); const wakeEnabled=useRef(false); const wakeBusy=useRef(false); const wakeRestartTimer=useRef<number|null>(null); const wakeResume=useRef<()=>void>(()=>{}); const recorder=useRef<MediaRecorder|null>(null); const stream=useRef<MediaStream|null>(null); const audioChunks=useRef<Blob[]>([]); const input=useRef<HTMLTextAreaElement>(null);
 const Speech=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
 const latest=messages[messages.length-1];
 const send=async(value=prompt)=>{const q=value.trim();if(!q||busy)return;setError("");setBusy(true);setMessages(m=>[...m,{role:"user",text:q}]);setPrompt("");setTab("Command");try{
  const explicitAds = buildExplicitAdsSimulation(q);
  if (explicitAds) {
    setBrainStatus("CONNECTED");
    setMessages(m=>[...m,{role:"assistant",text:"I've extracted the campaign inputs directly and run a validated simulation.",result:explicitAds}]);
    return;
  }
  const decision=await askGroqBrain(q,messages.slice(-8));setBrainStatus("CONNECTED");
  if(decision.type==="answer"||decision.type==="clarify"){setMessages(m=>[...m,{role:"assistant",text:decision.reply}]);return;}
  const modelResult=runModel(decision.model as ModelSpec);
  const result:SimResult={kind:detectKind(q)||"risk",title:modelResult.name,summary:decision.reply+" This is a randomized model based on the generated assumptions, not a prediction.",metrics:[{label:"Expected outcome",value:money(modelResult.mean)},{label:"Median outcome",value:money(modelResult.median)},{label:"5th percentile",value:money(modelResult.p05)},{label:"95th percentile",value:money(modelResult.p95)},{label:"Positive outcomes",value:(modelResult.probabilityPositive*100).toFixed(1)+"%"},{label:"Negative outcomes",value:(modelResult.probabilityNegative*100).toFixed(1)+"%"}],chart:modelResult.samples,notes:["Generated by Groq from the supplied assumptions. Validate assumptions before relying on the result.","Monte Carlo outputs are conditional on the selected distributions; they are not guarantees."],assumptions:[modelResult.formula,...(decision.model.variables||[]).map((v:any)=>v.name+": "+JSON.stringify(v.distribution)),modelResult.trials.toLocaleString("en-IN")+" trials"]};
  setMessages(m=>[...m,{role:"assistant",text:"I've interpreted your request and constructed a custom simulation. Here are the results and assumptions.",result}]);return;
 }catch(e){setMessages(m=>[...m,{role:"assistant",text:e instanceof Error?e.message:"I couldn't process that request."}]);}finally{setBusy(false);}};
 const startVoice=async()=>{if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){setError("Audio recording is unavailable in this browser. Try a recent version of Chrome or Edge.");return;}try{const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});stream.current=media;audioChunks.current=[];const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":MediaRecorder.isTypeSupported("audio/webm")?"audio/webm":"";const rec=new MediaRecorder(media,mime?{mimeType:mime}:undefined);recorder.current=rec;rec.ondataavailable=(event)=>{if(event.data.size>0)audioChunks.current.push(event.data)};rec.onerror=()=>{setError("Microphone recording failed. Please try again.");setListening(false);setTranscribing(false);if(wakeBusy.current)wakeResume.current()};rec.onstop=async()=>{setListening(false);media.getTracks().forEach(track=>track.stop());stream.current=null;const audio=new Blob(audioChunks.current,{type:rec.mimeType||"audio/webm"});audioChunks.current=[];if(!audio.size){setError("No audio was captured.");return;}setTranscribing(true);setError("");try{const text=await transcribeAudio(audio);setPrompt(text);}catch(e){setError(e instanceof Error?e.message:"Transcription failed.");}finally{setTranscribing(false);if(wakeBusy.current)wakeResume.current();}};rec.start();setListening(true);setError("");}catch(e){setError(e instanceof Error&&e.name==="NotAllowedError"?"Microphone permission is blocked. Allow microphone access in your browser settings.":"Could not access the microphone.");setListening(false);if(wakeBusy.current)wakeResume.current();}};
 const stopVoice=()=>{try{if(recorder.current&&recorder.current.state!=="inactive")recorder.current.stop();else setListening(false);}catch{setListening(false)}};
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
    r=new Speech();recognition.current=r;r.lang="en-GB";r.continuous=true;r.interimResults=true;
    r.onresult=(e:any)=>{
      let transcript="";
      for(let i=e.resultIndex;i<e.results.length;i++)transcript+=e.results[i][0].transcript;
      const match=transcript.match(/\bjarvis\b[,. ]*(.*)/i);
      if(match&&!wakeBusy.current){
        wakeBusy.current=true;
        const command=match[1].trim();
        try{r.stop()}catch{}
        if(command.length>2){
          speak("Certainly.");
          send(command).finally(()=>wakeResume.current());
        }else{
          speak("Yes, ma’am?");
          window.setTimeout(()=>startVoice(),900);
        }
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
 const nav=[{name:"Command",icon:Command},{name:"Simulations",icon:FlaskConical},{name:"Model Lab",icon:FlaskConical},{name:"Activity",icon:History},{name:"Settings",icon:Settings2}];
 return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><AudioLines size={20}/></div><div><b>JARVIS</b><small>PERSONAL INTELLIGENCE</small></div></div><div className="side-caption">WORKSPACE</div>{nav.map(n=><button key={n.name} className={"nav-item "+(tab===n.name?"active":"")} onClick={()=>setTab(n.name)}><n.icon size={17}/>{n.name}<ChevronRight size={14}/></button>)}<div className="sidebar-bottom"><div className="status-orb"><span/>CORE STANDBY</div><small>LOCAL SIMULATION ENGINE</small><small>BUILD 0.1 · PREVIEW</small></div></aside><main className="main-area"><header className="topbar"><div><span className="crumb">JARVIS</span><span className="slash">/</span>{tab}</div><div className="top-status"><span/> SYSTEM NOMINAL <button title="Enable speech wake phrase while JARVIS is running" onClick={()=>setWake(!wake)} className={wake?"wake active":"wake"}><Radio size={15}/>{wake?"WAKE MODE ON":"WAKE MODE OFF"}</button></div></header>
 {tab==="Command"&&<div className="command-page"><div className="welcome"><div className="eyebrow"><Sparkles size={13}/> PERSONAL AI / READY</div><h1>At your command.</h1><p>Think out loud. Ask questions. Run simulations. I'll help turn the idea into a model you can inspect.</p></div><section className="conversation">{messages.map((m,i)=><div key={i} className={"message "+m.role}><div className="avatar">{m.role==="assistant"?<AudioLines size={16}/>: "YOU"}</div><div className="message-body"><div className="message-label">{m.role==="assistant"?"JARVIS":"YOU"}</div><p>{m.text}</p>{m.result&&<ResultCard result={m.result}/>}</div>{m.role==="assistant"&&<button className="icon-button speak" title="Read response aloud" onClick={()=>speak(m.text)}><Volume2 size={15}/></button>}</div>)}</section><div className="composer-wrap"><div className="composer"><textarea ref={input} rows={2} value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}} placeholder={busy?"JARVIS is thinking…":"JARVIS, ask or simulate anything…"}/><div className="composer-actions"><div><button className={"icon-button mic "+(listening?"recording":"")} disabled={transcribing} onClick={listening?stopVoice:startVoice} title={listening?"Stop listening":"Speak a command"}>{listening?<MicOff size={17}/>:<Mic size={17}/>}</button><span className="hint">{listening?"RECORDING…":transcribing?"TRANSCRIBING WITH DEEPGRAM…":"VOICE OR TEXT · SHIFT + ENTER FOR NEW LINE"}</span></div><button className="send-button" onClick={()=>send()} disabled={!prompt.trim()||busy}><Send size={16}/> {busy?"Thinking…":"Run command"}</button></div></div>{error&&<p className="error">{error}</p>}<div className="quick-prompts"><span>TRY</span>{["Simulate ₹2,000 in Google Ads","Model a 20% monthly growth rate","Compare pricing at ₹299, ₹499 and ₹799","Estimate a 30-day project schedule"].map(x=><button key={x} onClick={()=>send(x)}>{x}</button>)}</div></div></div>}
 {tab==="Simulations"&&<div className="section-page"><div className="eyebrow">MODEL LIBRARY / 08 ENGINES</div><h1>Choose a simulation.</h1><p className="muted">Start with a model. JARVIS can then help refine the assumptions in natural language.</p><div className="sim-grid">{simTypes.map(t=><button className={"sim-tile "+(selected===t.id?"selected":"")} key={t.id} onClick={()=>{setSelected(t.id);setPrompt("Run a "+t.name.toLowerCase()+" simulation");setTab("Command");input.current?.focus()}}><span className="tile-symbol">{t.icon}</span><b>{t.name}</b><p>{t.description}</p><span className="tile-cta">CONFIGURE <ChevronRight size={13}/></span></button>)}</div><div className="notice"><ShieldCheck size={18}/><p><b>Simulation safety</b><br/>These models run locally in your browser using illustrative assumptions. They do not spend money, place trades, launch campaigns or change external accounts.</p></div></div>}
 {tab==="Model Lab"&&<div className="section-page"><CustomSimulator/></div>}{tab==="Activity"&&<div className="section-page"><div className="eyebrow">SESSION LOG</div><h1>Recent activity.</h1><p className="muted">Your current session's commands and simulation outputs.</p><div className="activity-list">{messages.filter(m=>m.role==="user").map((m,i)=><div key={i}><span>{String(i+1).padStart(2,"0")}</span><p>{m.text}</p><small>{messages.filter(x=>x.role==="assistant"&&x.result)[i]?.result?.title||"Command processed"}</small></div>)}</div>{messages.length===1&&<p className="empty">No commands yet. Start with a simulation in the Command Center.</p>}</div>}
 {tab==="Settings"&&<div className="section-page"><div className="eyebrow">PREFERENCES & PERMISSIONS</div><h1>System settings.</h1><div className="settings-card"><div><b>Voice personality</b><p>British English · measured pace · lower pitch where supported by your system voice</p></div><span className="setting-pill">JARVIS STYLE</span></div><div className="settings-card"><div><b>Wake phrase</b><p>Say “JARVIS” while this interface is open and wake mode is enabled. The desktop companion can keep its window running in the background, but wake detection depends on browser speech-recognition support and microphone permission.</p></div><span className="setting-pill muted-pill">BROWSER SPEECH</span></div><div className="settings-card brain-settings"><div><b>Groq cloud brain</b><p>JARVIS uses Groq for reasoning and Deepgram Nova-3 for speech-to-text. Your API key stays on the server in Vercel and is never sent to the browser. Chat model: openai/gpt-oss-20b · Speech recognition: Deepgram Nova-3.</p><button className="secondary-button" onClick={async()=>{setBrainStatus("CONNECTING");try{await askGroqBrain("Reply with a brief greeting confirming the JARVIS connection is online.");setBrainStatus("CONNECTED");setError("");}catch(e){setBrainStatus("OFFLINE");setError(e instanceof Error?e.message:"Groq connection test failed.");}}}>Test Groq connection</button></div><span className="setting-pill muted-pill">{brainStatus}</span></div><div className="settings-card"><div><b>Privacy</b><p>Microphone access starts only after you explicitly enable wake mode or press the voice button. Microphone recordings are sent securely to Deepgram Nova-3 for transcription only after you press the microphone button and stop recording. JARVIS does not save audio recordings.</p></div><span className="setting-pill">OPT-IN</span></div><button className="secondary-button" onClick={()=>speak("Good evening. All systems are standing by.")}><Volume2 size={16}/> Test voice</button></div>}
 <footer><span>JARVIS PERSONAL INTELLIGENCE</span><span>SIMULATIONS ARE ILLUSTRATIVE · NO EXTERNAL ACTIONS</span></footer></main></div>;
}
