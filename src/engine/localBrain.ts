export type BrainDecision =
 | { type:"simulation"; reply:string; model:{name:string;formula:string;trials:number;variables:any[]} }
 | { type:"answer"|"clarify"; reply:string };
export async function askLocalBrain(prompt:string, model="qwen2.5:3b"):Promise<BrainDecision>{
 if(prompt.length>8000)throw new Error("Please keep each request under 8,000 characters.");
 const system=`You are JARVIS, a precise and helpful personal assistant. Understand the user's request. If they ask to simulate or model a scenario, produce a mathematical model with explicit assumptions. If essential inputs are missing, ask a concise clarifying question instead of inventing important values. For general questions, answer directly. Return ONLY valid JSON matching one of these forms:
{"type":"simulation","reply":"brief description","model":{"name":"short model title","formula":"arithmetic expression using variable names","trials":10000,"variables":[{"name":"revenue","distribution":{"type":"normal","mean":10000,"sd":1000}},{"name":"costs","distribution":{"type":"uniform","min":4000,"max":6000}}]}}
{"type":"clarify","reply":"one concise question"}
{"type":"answer","reply":"your answer"}
Allowed distributions: fixed(value), uniform(min,max), normal(mean,sd), triangular(min,mode,max), bernoulli(probability,whenTrue,whenFalse). Formulas support arithmetic + - * / ^, parentheses, and abs,sqrt,log,exp,min,max,floor,ceil,round,pow. Use only variable names, no code, no property access, no functions outside this list. Trials must be 1000 to 100000. Never claim a simulation is a forecast or certainty. Do not initiate external actions, purchases, investments, ad campaigns, messages, or account changes. If user asks to execute an external action, explain that JARVIS only prepares and analyzes it in this prototype and requires explicit review.`;
 let content="";
 if(window.jarvis?.askLocal){content=await window.jarvis.askLocal({prompt,model});}
 else{
  const response=await fetch("http://127.0.0.1:11434/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:system},{role:"user",content:prompt}],stream:false,format:"json",options:{temperature:.2}})});
  if(!response.ok)throw new Error("Local model request failed ("+response.status+"). Is Ollama running?");
  const data=await response.json();content=data.message?.content||"";
 }
 const parsed=JSON.parse(content) as BrainDecision;
 if(!parsed||!["simulation","answer","clarify"].includes(parsed.type)||typeof parsed.reply!=="string")throw new Error("The local model returned an unsupported response.");
 if(parsed.type==="simulation"&&(!parsed.model||typeof parsed.model.formula!=="string"||!Array.isArray(parsed.model.variables)))throw new Error("The model did not return a valid simulation specification.");
 return parsed;
}
declare global { interface Window { jarvis?: { askLocal:(args:{prompt:string;model:string})=>Promise<string> } } }
